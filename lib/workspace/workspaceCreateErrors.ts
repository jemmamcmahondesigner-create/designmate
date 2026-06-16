export function duplicateOwnedWorkspaceMessage(name: string): string {
  const trimmed = name.trim();
  return `You already have a workspace named '${trimmed}' — choose a different name.`;
}

export function isWorkspaceNameUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return (
    code === "23505" &&
    (message.includes("workspaces_name_lower_per_owner_idx") ||
      message.includes("workspaces_name_lower_idx"))
  );
}

export function parseWorkspaceCreateError(error: unknown, name: string): string {
  if (isWorkspaceNameUniqueViolation(error)) {
    return duplicateOwnedWorkspaceMessage(name);
  }

  const message = String((error as { message?: string } | null)?.message ?? "").trim();
  return message || "Couldn't create workspace. Please try again.";
}

export function normalizeWorkspaceNameKey(name: string): string {
  return name.trim().toLowerCase();
}
