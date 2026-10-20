import { createServiceClient } from "@/lib/supabase/admin";
import { permissionFromWorkspaceMember } from "@/lib/workspace/parseWorkspaceMember";
import type { WorkspacePermissionLevel } from "@/lib/workspace/permissions";

export type ReviewWorkspaceAccess =
  | {
      ok: true;
      workspaceId: string;
      permissionLevel: WorkspacePermissionLevel;
      reviewFocus: string | null;
    }
  | { ok: false; status: 404 | 403 };

/**
 * Service-role membership gate for a review's workspace.
 * Missing review and non-membership both return 404 so another tenant
 * cannot confirm that a review id exists.
 */
export async function assertReviewWorkspaceEditor(input: {
  userId: string;
  reviewId: string;
}): Promise<ReviewWorkspaceAccess> {
  const service = createServiceClient();
  const { data: review } = await service
    .from("reviews")
    .select("id, review_focus, project_id")
    .eq("id", input.reviewId)
    .maybeSingle();

  const projectId = String(
    (review as { project_id?: string | null } | null)?.project_id ?? "",
  ).trim();
  if (!review || !projectId) {
    return { ok: false, status: 404 };
  }

  const { data: project } = await service
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .maybeSingle();

  const workspaceId = String(
    (project as { workspace_id?: string | null } | null)?.workspace_id ?? "",
  ).trim();
  if (!workspaceId) {
    return { ok: false, status: 404 };
  }

  const { data: member } = await service
    .from("workspace_members")
    .select("permission_level, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .maybeSingle();

  if (!member) {
    return { ok: false, status: 404 };
  }

  const permissionLevel = permissionFromWorkspaceMember(member);
  if (permissionLevel !== "admin" && permissionLevel !== "editor") {
    return { ok: false, status: 403 };
  }

  const focusRaw = (review as { review_focus?: string | null }).review_focus;
  const reviewFocus =
    focusRaw == null || String(focusRaw).trim() === ""
      ? null
      : String(focusRaw).trim();

  return { ok: true, workspaceId, permissionLevel, reviewFocus };
}
