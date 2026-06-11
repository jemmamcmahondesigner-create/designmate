import { RolesSettingsPage, type RoleRow } from "@/components/settings/RolesSettingsPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectReviewerFromRestrictedSettings } from "@/lib/workspace/redirectReviewerFromRestrictedSettings";

type ContributorRow = {
  id?: string;
  name?: string | null;
  role?: string | null;
  role_id?: string | null;
  deleted_at?: string | null;
};

function contributorMatchesRole(
  contributor: ContributorRow,
  role: { id: string; name: string },
): boolean {
  if (contributor.deleted_at != null) return false;
  const roleId = contributor.role_id;
  if (roleId != null && String(roleId) === String(role.id)) return true;
  if (roleId == null) {
    const contributorRole = String(contributor.role ?? "").trim().toLowerCase();
    const roleName = String(role.name ?? "").trim().toLowerCase();
    if (contributorRole && roleName && contributorRole === roleName) return true;
  }
  return false;
}

export default async function SettingsRolesPage() {
  await redirectReviewerFromRestrictedSettings();

  const supabase = await createSupabaseServerClient();

  const { data: roleRows, error: rolesError } = await supabase
    .from("contributor_roles")
    .select("id, name")
    .order("name", { ascending: true });

  if (rolesError) {
    console.error("Roles fetch error:", rolesError);
  }

  const { data: contributorRows, error: contributorsError } = await supabase
    .from("contributors")
    .select("id, name, role, role_id, deleted_at");

  if (contributorsError) {
    console.error("Roles contributors fetch error:", contributorsError);
  }

  const roles = (roleRows ?? []) as { id: string; name: string }[];
  const contributors = (contributorRows ?? []) as ContributorRow[];

  const initialRoles: RoleRow[] = roles.map((r) => {
    const members = contributors
      .filter((c) => contributorMatchesRole(c, r))
      .map((c) => ({
        id: String(c.id ?? ""),
        name: String(c.name ?? "").trim(),
      }))
      .filter((m) => m.id && m.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      memberCount: members.length,
      members,
    };
  });

  return <RolesSettingsPage initialRoles={initialRoles} />;
}
