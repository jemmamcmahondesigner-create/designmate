import { createServiceClient } from "@/lib/supabase/admin";
import { permissionFromWorkspaceMember } from "@/lib/workspace/parseWorkspaceMember";
import type { WorkspacePermissionLevel } from "@/lib/workspace/permissions";

export type ReviewWorkspaceAccess =
  | {
      ok: true;
      workspaceId: string;
      permissionLevel: WorkspacePermissionLevel;
      reviewFocus: string | null;
      creatorId: string | null;
    }
  | { ok: false; status: 404 | 403 };

async function loadReviewWorkspaceMember(input: {
  userId: string;
  reviewId: string;
}): Promise<ReviewWorkspaceAccess> {
  const service = createServiceClient();
  const { data: review } = await service
    .from("reviews")
    .select("id, review_focus, project_id, creator_id")
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
  const focusRaw = (review as { review_focus?: string | null }).review_focus;
  const reviewFocus =
    focusRaw == null || String(focusRaw).trim() === ""
      ? null
      : String(focusRaw).trim();
  const creatorRaw = String(
    (review as { creator_id?: string | null }).creator_id ?? "",
  ).trim();

  return {
    ok: true,
    workspaceId,
    permissionLevel,
    reviewFocus,
    creatorId: creatorRaw || null,
  };
}

/**
 * Service-role membership gate for a review's workspace.
 * Missing review and non-membership both return 404 so another tenant
 * cannot confirm that a review id exists.
 */
export async function assertReviewWorkspaceEditor(input: {
  userId: string;
  reviewId: string;
}): Promise<ReviewWorkspaceAccess> {
  const access = await loadReviewWorkspaceMember(input);
  if (!access.ok) return access;
  if (access.permissionLevel !== "admin" && access.permissionLevel !== "editor") {
    return { ok: false, status: 403 };
  }
  return access;
}

/** Any active member of the review's workspace. Missing / outsider → 404. */
export async function assertReviewWorkspaceMember(input: {
  userId: string;
  reviewId: string;
}): Promise<ReviewWorkspaceAccess> {
  return loadReviewWorkspaceMember(input);
}

/** Active membership in a known workspace. Missing member → 404. */
export async function assertWorkspaceActiveMember(input: {
  userId: string;
  workspaceId: string;
}): Promise<
  | { ok: true; permissionLevel: WorkspacePermissionLevel }
  | { ok: false; status: 404 }
> {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    return { ok: false, status: 404 };
  }

  const service = createServiceClient();
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

  return {
    ok: true,
    permissionLevel: permissionFromWorkspaceMember(member),
  };
}
