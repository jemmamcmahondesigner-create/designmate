export type WorkspacePermissionLevel = "admin" | "editor" | "reviewer";

export type ReviewerType = "open" | "assigned";

export type ContentPermissionLevel = "editor" | "reviewer";

/** Splits stored permission into content role + Admin flag for UI. */
export function normalizeTeammatePermissionFields(
  permissionLevelRaw: unknown,
  isAdminRaw?: unknown,
): { contentPermissionLevel: ContentPermissionLevel; isAdmin: boolean } {
  const stored = normalizeWorkspacePermission(permissionLevelRaw);
  const isAdmin =
    stored === "admin" ||
    isAdminRaw === true ||
    String(isAdminRaw ?? "").toLowerCase() === "true";
  const contentPermissionLevel: ContentPermissionLevel =
    stored === "reviewer" ? "reviewer" : "editor";
  return { contentPermissionLevel, isAdmin };
}

/** Encodes content role + Admin flag for DB / API (no migration). */
export function toStoredPermissionLevel(
  content: ContentPermissionLevel,
  isAdmin: boolean,
): WorkspacePermissionLevel {
  if (isAdmin) return "admin";
  return content;
}

export function normalizeWorkspacePermission(
  value: unknown,
): WorkspacePermissionLevel {
  const normalized = String(value ?? "reviewer").toLowerCase();
  if (normalized === "admin" || normalized === "editor") return normalized;
  return "reviewer";
}

/** workspace_members.reviewer_type — meaningful only when permission_level is reviewer. */
export function normalizeReviewerType(value: unknown): ReviewerType {
  const normalized = String(value ?? "open").trim().toLowerCase();
  return normalized === "assigned" ? "assigned" : "open";
}

export function reviewerTypeForMember(
  permissionLevel: WorkspacePermissionLevel,
  reviewerTypeRaw: unknown,
): ReviewerType | null {
  if (permissionLevel !== "reviewer") return null;
  return normalizeReviewerType(reviewerTypeRaw);
}

/** Assigned reviewers are scoped to explicit project/review membership. */
export function isAssignedReviewerScope(
  permissionLevel: WorkspacePermissionLevel | string | null,
  reviewerType: ReviewerType | null,
): boolean {
  return (
    normalizeWorkspacePermission(permissionLevel) === "reviewer" &&
    (reviewerType ?? "open") === "assigned"
  );
}

/** Maps invite / API role strings to contributors.permission_level */
export function mapInvitePermissionLevel(role?: string | null): WorkspacePermissionLevel {
  const value = String(role ?? "reviewer").trim().toLowerCase();
  if (value === "admin") return "admin";
  if (value === "editor") return "editor";
  return "reviewer";
}

/** Maps permission level to workspace_members.role (admin | member only) */
export function mapWorkspaceMemberRole(
  permissionLevel: WorkspacePermissionLevel,
): "admin" | "member" {
  return permissionLevel === "admin" ? "admin" : "member";
}

export function isPaidPermissionLevel(level: WorkspacePermissionLevel): boolean {
  return level === "admin" || level === "editor";
}

export function canAddTeammates(level: WorkspacePermissionLevel | null): boolean {
  return level === "admin" || level === "editor";
}

/** workspace_members.permission_level — not contributors.role (job title). */
export function canCreateReviews(level: WorkspacePermissionLevel | null): boolean {
  return level === "admin" || level === "editor";
}

export const CREATE_REVIEW_DENIED_TOOLTIP =
  "Only editors and admins can create reviews";

export const EDIT_REVIEW_DENIED_MESSAGE =
  "Only editors and admins can change this.";

export function canEditTeammatePermission(level: WorkspacePermissionLevel | null): boolean {
  return level === "admin";
}

export function canShowTeammateKebabMenu(
  level: WorkspacePermissionLevel | null,
  options: { rowUserId: string | null; currentUserId: string | null },
): boolean {
  if (
    options.currentUserId &&
    options.rowUserId &&
    options.currentUserId === options.rowUserId
  ) {
    return true;
  }
  if (!level || level === "reviewer") return false;
  if (level === "admin") return true;
  if (!options.currentUserId || !options.rowUserId) return true;
  return options.rowUserId !== options.currentUserId;
}

export function isOwnTeammateRow(
  rowUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  return Boolean(rowUserId && currentUserId && rowUserId === currentUserId);
}
