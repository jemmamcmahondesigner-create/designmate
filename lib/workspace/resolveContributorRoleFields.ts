import type { SupabaseClient } from "@supabase/supabase-js";

export type ContributorRoleFields = {
  role: string | null;
  role_id: string | null;
};

/**
 * Keeps contributors.role (text) and contributors.role_id (FK) in sync when
 * writing job title. Custom roles that are not in contributor_roles get role_id null.
 */
export async function resolveContributorRoleFields(
  supabase: SupabaseClient,
  roleText: string | null | undefined,
  workspaceId?: string | null,
): Promise<ContributorRoleFields> {
  const role = roleText?.trim() || null;
  if (!role) return { role: null, role_id: null };

  const { data: roleRows, error } = await supabase
    .from("contributor_roles")
    .select("id, name, workspace_id");

  if (error) {
    console.error("contributor_roles lookup error:", error);
    return { role, role_id: null };
  }

  const normalized = role.toLowerCase();
  const activeWorkspaceId = workspaceId?.trim() || null;
  const match = (roleRows ?? []).find((row) => {
    const o = row as Record<string, unknown>;
    if (String(o.name ?? "").trim().toLowerCase() !== normalized) return false;
    const roleWorkspaceId =
      o.workspace_id == null || String(o.workspace_id).trim() === ""
        ? null
        : String(o.workspace_id);
    if (roleWorkspaceId == null) return true;
    return Boolean(activeWorkspaceId && roleWorkspaceId === activeWorkspaceId);
  });

  const roleId = match ? String((match as Record<string, unknown>).id ?? "") : "";
  return { role, role_id: roleId || null };
}
