import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { resolveWorkspaceMembership } from "@/lib/workspace/resolveWorkspaceMembership";

export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const workspaceId = getActiveWorkspaceIdFromUser(user);
    if (!workspaceId) {
      return NextResponse.json(
        { error: "No active_workspace_id found." },
        { status: 400 },
      );
    }

    const membership = await resolveWorkspaceMembership(supabase, workspaceId);
    if (membership.workspacePermissionLevel !== "admin") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const service = createServiceClient();
    const { error } = await service
      .from("workspace_figma_tokens")
      .delete()
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("[figma/disconnect] delete failed:", error);
      return NextResponse.json(
        { error: "Unable to disconnect Figma." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[figma/disconnect] unexpected error:", err);
    return NextResponse.json(
      { error: "Unable to disconnect Figma." },
      { status: 500 },
    );
  }
}
