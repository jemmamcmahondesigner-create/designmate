import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveCurrentContributor } from "@/lib/auth/effectiveContributor";
import { getDevImpersonatedContributorId } from "@/lib/auth/devImpersonation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import {
  permissionFromWorkspaceMember,
  reviewerTypeFromWorkspaceMember,
  type WorkspaceMemberPermissionRow,
} from "@/lib/workspace/parseWorkspaceMember";
import {
  isAssignedReviewerScope,
  normalizeWorkspacePermission,
  type ReviewerType,
  type WorkspacePermissionLevel,
} from "@/lib/workspace/permissions";

export type WorkspaceMembership = {
  workspacePermissionLevel: WorkspacePermissionLevel | null;
  reviewerType: ReviewerType | null;
  userId: string | null;
  workspaceId: string | null;
};

async function fetchWorkspaceMemberRow(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMemberPermissionRow | null> {
  const { data: member, error } = await supabase
    .from("workspace_members")
    .select("permission_level, role, reviewer_type")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    const { data: memberByRole } = await supabase
      .from("workspace_members")
      .select("role, reviewer_type")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    return (memberByRole as WorkspaceMemberPermissionRow | null) ?? null;
  }

  return (member as WorkspaceMemberPermissionRow | null) ?? null;
}

export async function resolveWorkspaceMembership(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<WorkspaceMembership> {
  const impersonatedContributorId = await getDevImpersonatedContributorId();

  if (impersonatedContributorId) {
    const { data: contributor } = await supabase
      .from("contributors")
      .select("user_id, permission_level")
      .eq("id", impersonatedContributorId)
      .maybeSingle();

    const row = contributor as {
      user_id?: string | null;
      permission_level?: string | null;
    } | null;
    const linkedUserId = row?.user_id?.trim() || null;

    if (linkedUserId) {
      const member = await fetchWorkspaceMemberRow(
        supabase,
        workspaceId,
        linkedUserId,
      );
      const workspacePermissionLevel = permissionFromWorkspaceMember(member);
      return {
        workspacePermissionLevel,
        reviewerType: reviewerTypeFromWorkspaceMember(
          member,
          workspacePermissionLevel,
        ),
        userId: linkedUserId,
        workspaceId,
      };
    }

    const contributorPermission = row?.permission_level?.trim();
    const workspacePermissionLevel = contributorPermission
      ? normalizeWorkspacePermission(contributorPermission)
      : null;
    return {
      workspacePermissionLevel,
      reviewerType:
        workspacePermissionLevel === "reviewer" ? "open" : null,
      userId: null,
      workspaceId,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      workspacePermissionLevel: null,
      reviewerType: null,
      userId: null,
      workspaceId,
    };
  }

  const member = await fetchWorkspaceMemberRow(supabase, workspaceId, user.id);
  const workspacePermissionLevel = permissionFromWorkspaceMember(member);

  return {
    workspacePermissionLevel,
    reviewerType: reviewerTypeFromWorkspaceMember(member, workspacePermissionLevel),
    userId: user.id,
    workspaceId,
  };
}

export async function getWorkspaceMembershipForCurrentUser(): Promise<WorkspaceMembership> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspaceId = getActiveWorkspaceIdFromUser(user);

  if (!workspaceId) {
    return {
      workspacePermissionLevel: null,
      reviewerType: null,
      userId: user?.id ?? null,
      workspaceId: null,
    };
  }

  return resolveWorkspaceMembership(supabase, workspaceId);
}

/** Project ids where the user has an explicit project-scoped contributor row. */
export async function getAssignedReviewerProjectIds(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("contributors")
    .select("project_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .not("project_id", "is", null);

  return (data ?? [])
    .map((row) => String((row as { project_id?: string | null }).project_id ?? "").trim())
    .filter(Boolean);
}

/** Contributor id used to scope assigned-reviewer review lists. */
export async function getAssignedReviewerContributorId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const membership = await getWorkspaceMembershipForCurrentUser();
  if (
    !isAssignedReviewerScope(
      membership.workspacePermissionLevel,
      membership.reviewerType,
    )
  ) {
    return null;
  }
  const contributor = await getEffectiveCurrentContributor(supabase);
  return contributor?.id?.trim() || null;
}
