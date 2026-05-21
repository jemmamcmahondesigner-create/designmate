import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ReviewArtifactStored, ReviewType } from "@/types/review";
import type { Tradeoff } from "@/app/actions/generateTradeoffs";
import {
  readDevImpersonationContributorIdFromBrowser,
  resolveEffectiveContributor,
} from "@/lib/auth/resolveEffectiveContributor";
import { logTimelineEventClient } from "@/lib/timeline/logEventClient";

/** Tradeoff row shape stored on `reviews.tradeoffs` jsonb (same as AI generate payload). */
export type TradeoffItem = Tradeoff;

export type ArtifactDraftForSubmit = {
  kind: "file" | "link";
  file: File | null;
  linkUrl: string;
  title: string;
  /** Display label; caller sets `v{n}` from `versionNumber`. */
  iterationLabel: string;
  description: string;
  /** When null, submit creates a new `artifacts` row for this project. */
  resolvedCanonicalArtifactId: string | null;
  versionNumber: number;
};

export type SubmitReviewInput = {
  reviewId: string;
  projectId: string;
  title: string;
  reviewType: ReviewType;
  sendNotification: boolean;
  reviewFocus: string | null;
  relatedProblemIds: string[];
  reviewerContributorIds: string[];
  requireDecisionMaker: boolean;
  ownerDisplayName: string;
  artifacts: ArtifactDraftForSubmit[];
  tradeoffs?: TradeoffItem[] | null;
};

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizePathSegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200) || "file";
}

export function validateSubmitInput(
  input: SubmitReviewInput
): string | null {
  if (!input.title.trim()) return "Review title is required.";
  if (!input.projectId) return "Project is required.";
  if (input.reviewerContributorIds.length === 0)
    return "Add at least one reviewer.";
  if (input.artifacts.length === 0) return "Add at least one artifact.";
  for (const a of input.artifacts) {
    if (!a.title.trim()) return "Each artifact needs a title.";
    if (!a.iterationLabel.trim())
      return "Each artifact needs a version label.";
    if (!Number.isFinite(a.versionNumber) || a.versionNumber < 1)
      return "Each artifact needs a valid version.";
    if (a.kind === "file") {
      if (!a.file) return "Each file artifact needs an uploaded file.";
    } else {
      if (!isValidHttpUrl(a.linkUrl)) return "Enter a valid http(s) link for each link artifact.";
    }
  }
  return null;
}

/**
 * reviews.creator_id → contributors.id (see migration).
 * Resolve the signed-in user's contributor row for this project (from auth.uid()).
 */
async function resolveReviewCreatorId(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  projectId: string,
): Promise<string | null> {
  const devContributorId = readDevImpersonationContributorIdFromBrowser();
  const effectiveContributor = await resolveEffectiveContributor(
    supabase,
    projectId,
    devContributorId,
  );
  if (effectiveContributor?.id?.trim()) {
    return effectiveContributor.id.trim();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authUserId = user?.id?.trim();
  if (!authUserId) return null;

  const { data: byUserId } = await supabase
    .from("contributors")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", authUserId)
    .maybeSingle();
  const contributorFromUser = String(
    (byUserId as { id?: string | null } | null)?.id ?? "",
  ).trim();
  if (contributorFromUser) return contributorFromUser;

  const email = user?.email?.trim();
  if (email) {
    const { data: byEmail } = await supabase
      .from("contributors")
      .select("id")
      .eq("project_id", projectId)
      .ilike("email", email)
      .maybeSingle();
    const contributorFromEmail = String(
      (byEmail as { id?: string | null } | null)?.id ?? "",
    ).trim();
    if (contributorFromEmail) return contributorFromEmail;
  }

  const { data: workspaceRow } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .maybeSingle();
  const workspaceId = String(
    (workspaceRow as { workspace_id?: string | null } | null)?.workspace_id ?? "",
  ).trim();
  if (workspaceId) {
    const { data: workspaceContributor } = await supabase
      .from("contributors")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", authUserId)
      .maybeSingle();
    const id = String(
      (workspaceContributor as { id?: string | null } | null)?.id ?? "",
    ).trim();
    if (id) return id;
  }

  return null;
}

function fileTypeForVersion(
  kind: "file" | "link",
  stored: ReviewArtifactStored
): string {
  if (kind === "link") {
    const u = (stored.url ?? "").toLowerCase();
    return u.includes("figma.com") ? "figma" : "link";
  }
  const name = (stored.originalFileName ?? "").toLowerCase();
  const ext = name.split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return ext || "image";
  return "file";
}

export async function submitReviewClient(
  input: SubmitReviewInput
): Promise<{ error: string | null }> {
  const clientError = validateSubmitInput(input);
  if (clientError) return { error: clientError };

  const supabase = createSupabaseBrowserClient();
  const stored: ReviewArtifactStored[] = [];

  for (let i = 0; i < input.artifacts.length; i++) {
    const a = input.artifacts[i];
    if (a.kind === "file" && a.file) {
      const safeName = sanitizePathSegment(a.file.name);
      const objectPath = `${input.reviewId}/${i}-${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("review-artifacts")
        .upload(objectPath, a.file, {
          cacheControl: "3600",
          upsert: false
        });

      let publicUrl: string | null = null;
      if (!upErr) {
        const { data: pub } = supabase.storage
          .from("review-artifacts")
          .getPublicUrl(objectPath);
        publicUrl = pub.publicUrl ?? null;
      }

      stored.push({
        kind: "file",
        title: a.title.trim(),
        iterationLabel: `v${a.versionNumber}`,
        description: a.description.trim(),
        url: publicUrl,
        originalFileName: a.file.name,
        mimeType: a.file.type || null,
        sizeBytes: a.file.size
      });
    } else {
      stored.push({
        kind: "link",
        title: a.title.trim(),
        iterationLabel: `v${a.versionNumber}`,
        description: a.description.trim(),
        url: a.linkUrl.trim()
      });
    }
  }

  const primaryArtifact = stored[0];
  const artifactFileName =
    primaryArtifact?.originalFileName ??
    (primaryArtifact?.kind === "link" ? primaryArtifact.url : null);
  const artifactFileType: "figma" | "pdf" | null = primaryArtifact
    ? primaryArtifact.kind === "file" &&
      (primaryArtifact.mimeType === "application/pdf" ||
        (primaryArtifact.originalFileName ?? "").toLowerCase().endsWith(".pdf"))
      ? "pdf"
      : "figma"
    : null;
  const artifactName = primaryArtifact?.title ?? null;
  const artifactIteration = primaryArtifact?.iterationLabel ?? null;
  const artifactDescription = primaryArtifact?.description ?? null;
  const artifactFileUrl = primaryArtifact?.url ?? null;

  // TODO: migrate existing artifact storage to artifact_versions once
  // artifact_versions is the primary source of truth (retire reviews.artifacts jsonb).

  const firstReviewerId = input.reviewerContributorIds[0];
  const decisionOwnerId =
    input.requireDecisionMaker && firstReviewerId ? firstReviewerId : null;

  const devContributorId = readDevImpersonationContributorIdFromBrowser();
  const effectiveContributor = await resolveEffectiveContributor(
    supabase,
    input.projectId,
    devContributorId,
  );
  const ownerDisplayNameResolved =
    effectiveContributor?.name?.trim() ||
    input.ownerDisplayName.trim() ||
    "Reviewer";
  const creatorId = await resolveReviewCreatorId(supabase, input.projectId);
  const createdBy = creatorId;

  const { error } = await supabase.from("reviews").insert({
    id: input.reviewId,
    project_id: input.projectId,
    title: input.title.trim(),
    review_type: input.reviewType,
    send_notification: input.sendNotification,
    review_focus: input.reviewFocus?.trim() || null,
    related_problem_ids: input.relatedProblemIds,
    reviewer_contributor_ids: input.reviewerContributorIds,
    decision_owner_id: decisionOwnerId,
    require_decision_maker: input.requireDecisionMaker,
    owner_display_name: ownerDisplayNameResolved,
    creator_id: creatorId,
    artifact_file_name: artifactFileName,
    artifact_file_type: artifactFileType,
    artifact_name: artifactName,
    artifact_iteration: artifactIteration,
    artifact_description: artifactDescription,
    artifact_file_url: artifactFileUrl,
    artifacts: stored,
    status: "in-review",
    tradeoffs: input.tradeoffs ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  for (let i = 0; i < input.artifacts.length; i++) {
    const draft = input.artifacts[i];
    const row = stored[i];
    let canonicalId = draft.resolvedCanonicalArtifactId?.trim() || null;

    if (!canonicalId) {
      const { data: insertedArtifact, error: artErr } = await supabase
        .from("artifacts")
        .insert({
          project_id: input.projectId,
          name: draft.title.trim(),
          description: draft.description.trim() || null,
          created_by: createdBy,
        })
        .select("id")
        .single();
      if (artErr || !insertedArtifact) {
        return { error: artErr?.message ?? "Could not create artifact." };
      }
      canonicalId = String((insertedArtifact as Record<string, unknown>).id ?? "");
    } else {
      await supabase
        .from("artifacts")
        .update({
          name: draft.title.trim(),
          description: draft.description.trim() || null,
        })
        .eq("id", canonicalId);
    }

    const fileUrl = draft.kind === "file" ? row.url : null;
    const linkUrl = draft.kind === "link" ? row.url : null;
    const fileName =
      draft.kind === "file" ? row.originalFileName ?? null : null;

    const { error: verErr } = await supabase.from("artifact_versions").insert({
      artifact_id: canonicalId,
      version_number: draft.versionNumber,
      review_id: input.reviewId,
      file_url: fileUrl,
      link_url: linkUrl,
      file_name: fileName,
      file_type: fileTypeForVersion(draft.kind, row),
      description: draft.description.trim() || null,
      created_by: createdBy,
    });

    if (verErr) {
      return { error: verErr.message };
    }
  }

  await logTimelineEventClient({
    projectId: input.projectId,
    reviewId: input.reviewId,
    actorId: creatorId,
    eventType: "review_created",
    payload: {
      review_title: input.title.trim(),
      review_id: input.reviewId,
      review_status: "in-review",
      review_type: input.reviewType
    }
  });
  await logTimelineEventClient({
    projectId: input.projectId,
    reviewId: input.reviewId,
    actorId: creatorId,
    eventType: "artifact_uploaded",
    payload: {
      iteration_label: primaryArtifact?.iterationLabel ?? "v1",
      artifact_names: stored.map((artifact) => artifact.title).filter(Boolean),
      review_title: input.title.trim(),
      review_id: input.reviewId
    }
  });
  return { error: null };
}
