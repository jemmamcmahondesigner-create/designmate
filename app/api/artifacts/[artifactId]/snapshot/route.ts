import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getValidFigmaToken } from "@/lib/figma/getValidFigmaToken";

function extractFigmaFileKey(linkUrl: string): string | null {
  try {
    const pathname = new URL(linkUrl).pathname;
    const match = pathname.match(/\/(design|file|board)\/([^/?#]+)/i);
    const key = match?.[2]?.trim();
    return key || null;
  } catch {
    return null;
  }
}

function extractFigmaNodeId(linkUrl: string): string | null {
  try {
    const raw = new URL(linkUrl).searchParams.get("node-id")?.trim();
    if (!raw) return null;
    return decodeURIComponent(raw).replace(/-/g, ":");
  } catch {
    return null;
  }
}

export async function POST(
  _request: Request,
  context: { params: { artifactId: string } },
) {
  try {
    const artifactId = context.params.artifactId?.trim();
    if (!artifactId) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const service = createServiceClient();

    const { data: artifact, error: artifactError } = await service
      .from("artifacts")
      .select("id, project_id, name")
      .eq("id", artifactId)
      .maybeSingle();

    if (artifactError || !artifact) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const projectId = String(
      (artifact as { project_id?: string | null }).project_id ?? "",
    ).trim();
    const artifactName = String(
      (artifact as { name?: string | null }).name ?? "",
    ).trim();

    const { data: versionRows, error: versionError } = await service
      .from("artifact_versions")
      .select("id, review_id, link_url, created_at")
      .eq("artifact_id", artifactId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (versionError || !versionRows?.[0]) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const version = versionRows[0] as {
      review_id?: string | null;
      link_url?: string | null;
    };
    const linkUrl = String(version.link_url ?? "").trim();

    if (!linkUrl.toLowerCase().includes("figma.com")) {
      return NextResponse.json({ error: "not_figma_artifact" }, { status: 400 });
    }

    const fileKey = extractFigmaFileKey(linkUrl);
    const nodeId = extractFigmaNodeId(linkUrl);

    if (!nodeId) {
      return NextResponse.json(
        {
          error: "no_node_id",
          message:
            "Add a specific frame link for snapshots — whole file links cannot be captured.",
        },
        { status: 400 },
      );
    }

    if (!fileKey) {
      return NextResponse.json({ error: "not_figma_artifact" }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const { data: project, error: projectError } = await service
      .from("projects")
      .select("workspace_id")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !project) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const workspaceId = String(
      (project as { workspace_id?: string | null }).workspace_id ?? "",
    ).trim();

    if (!workspaceId) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const accessToken = await getValidFigmaToken(workspaceId);
    if (!accessToken) {
      return NextResponse.json({ error: "no_figma_token" }, { status: 400 });
    }

    const imagesUrl = new URL(
      `https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}`,
    );
    imagesUrl.searchParams.set("ids", nodeId);
    imagesUrl.searchParams.set("format", "png");
    imagesUrl.searchParams.set("scale", "2");

    const figmaRes = await fetch(imagesUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!figmaRes.ok) {
      console.error("[artifact-snapshot] figma images API failed:", figmaRes.status);
      return NextResponse.json({ error: "figma_api_error" }, { status: 500 });
    }

    const figmaJson = (await figmaRes.json()) as {
      images?: Record<string, string | null | undefined>;
    };
    const imageUrl = figmaJson.images?.[nodeId] ?? null;

    if (!imageUrl) {
      console.error("[artifact-snapshot] figma images missing node:", nodeId);
      return NextResponse.json({ error: "figma_api_error" }, { status: 500 });
    }

    const pngRes = await fetch(imageUrl);
    if (!pngRes.ok) {
      console.error("[artifact-snapshot] png download failed:", pngRes.status);
      return NextResponse.json({ error: "figma_api_error" }, { status: 500 });
    }

    const pngBytes = Buffer.from(await pngRes.arrayBuffer());
    const storagePath = `${workspaceId}/${artifactId}.png`;

    const { error: uploadError } = await service.storage
      .from("artifact-snapshots")
      .upload(storagePath, pngBytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("[artifact-snapshot] storage upload failed:", uploadError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const { data: signedData, error: signedError } = await service.storage
      .from("artifact-snapshots")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    if (signedError || !signedData?.signedUrl) {
      console.error("[artifact-snapshot] signed URL failed:", signedError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const snapshotUrl = signedData.signedUrl;
    const capturedAt = new Date().toISOString();

    const { error: updateError } = await service
      .from("artifacts")
      .update({
        snapshot_url: snapshotUrl,
        snapshot_captured_at: capturedAt,
      })
      .eq("id", artifactId);

    if (updateError) {
      console.error("[artifact-snapshot] artifact update failed:", updateError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const reviewId = String(version.review_id ?? "").trim() || null;

    const { error: timelineError } = await service.from("timeline_events").insert({
      event_type: "snapshot_captured",
      review_id: reviewId,
      project_id: projectId,
      actor_id: user.id,
      payload: {
        artifact_id: artifactId,
        artifact_name: artifactName,
      },
    });

    if (timelineError) {
      console.error("[artifact-snapshot] timeline insert failed:", timelineError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, snapshot_url: snapshotUrl },
      { status: 200 },
    );
  } catch (err) {
    console.error("[artifact-snapshot] unexpected error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
