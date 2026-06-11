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
): Promise<ContributorRoleFields> {
  const role = roleText?.trim() || null;
  if (!role) return { role: null, role_id: null };

  const { data: roleRows, error } = await supabase
    .from("contributor_roles")
    .select("id, name");

  if (error) {
    console.error("contributor_roles lookup error:", error);
    return { role, role_id: null };
  }

  const normalized = role.toLowerCase();
  const match = (roleRows ?? []).find((row) => {
    const o = row as Record<string, unknown>;
    return String(o.name ?? "").trim().toLowerCase() === normalized;
  });

  const roleId = match ? String((match as Record<string, unknown>).id ?? "") : "";
  return { role, role_id: roleId || null };
}
