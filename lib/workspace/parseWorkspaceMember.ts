import {
  normalizeReviewerType,
  normalizeWorkspacePermission,
  reviewerTypeForMember,
  type ReviewerType,
  type WorkspacePermissionLevel,
} from "@/lib/workspace/permissions";

export type WorkspaceMemberPermissionRow = {
  permission_level?: string | null;
  role?: string | null;
  reviewer_type?: string | null;
};

export function permissionFromWorkspaceMember(
  member: WorkspaceMemberPermissionRow | null,
): WorkspacePermissionLevel {
  if (!member) return "reviewer";

  const permissionLevel = member.permission_level?.trim();
  if (permissionLevel) {
    return normalizeWorkspacePermission(permissionLevel);
  }

  const memberRole = String(member.role ?? "").trim().toLowerCase();
  if (memberRole === "admin") return "admin";
  if (memberRole === "editor") return "editor";
  if (memberRole === "reviewer" || memberRole === "member") return "reviewer";

  return "reviewer";
}

export function reviewerTypeFromWorkspaceMember(
  member: WorkspaceMemberPermissionRow | null,
  permissionLevel: WorkspacePermissionLevel,
): ReviewerType | null {
  return reviewerTypeForMember(permissionLevel, member?.reviewer_type);
}

export { normalizeReviewerType };
