export type WorkspacePermissionLevel = "admin" | "editor" | "reviewer";

export function normalizeWorkspacePermission(
  value: unknown,
): WorkspacePermissionLevel {
  const normalized = String(value ?? "reviewer").toLowerCase();
  if (normalized === "admin" || normalized === "editor") return normalized;
  return "reviewer";
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

export function canEditTeammatePermission(level: WorkspacePermissionLevel | null): boolean {
  return level === "admin";
}

export function canShowTeammateKebabMenu(
  level: WorkspacePermissionLevel | null,
  options: { rowUserId: string | null; currentUserId: string | null },
): boolean {
  if (!level || level === "reviewer") return false;
  if (level === "admin") return true;
  if (!options.currentUserId || !options.rowUserId) return true;
  return options.rowUserId !== options.currentUserId;
}
