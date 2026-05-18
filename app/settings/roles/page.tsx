import { RolesSettingsPage, type RoleRow } from "@/components/settings/RolesSettingsPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NestedContributor = {
  id?: string;
  name?: string | null;
  deleted_at?: string | null;
};

type RoleNestedRow = {
  id: string;
  name: string;
  contributors?: NestedContributor[] | null;
};

export default async function SettingsRolesPage() {
  const supabase = await createSupabaseServerClient();

  let initialRoles: RoleRow[] = [];

  const { data: roleRowsNested, error: rolesNestedError } = await supabase
    .from("contributor_roles")
    .select("id, name, contributors(id, name, deleted_at)")
    .order("name", { ascending: true });

  if (rolesNestedError) {
    console.error("Roles fetch error:", rolesNestedError);
  }

  if (!rolesNestedError && roleRowsNested != null) {
    initialRoles = (roleRowsNested as RoleNestedRow[]).map((r) => {
      const contribs = r.contributors ?? [];
      const memberNames = contribs
        .filter((c) => c.deleted_at == null)
        .map((c) => String(c.name ?? ""))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return {
        id: String(r.id ?? ""),
        name: String(r.name ?? ""),
        memberCount: memberNames.length,
        memberNames,
      };
    });
  } else {
    const { data: roleRows, error: rolesError } = await supabase
      .from("contributor_roles")
      .select("id, name")
      .order("name", { ascending: true });

    if (rolesError) {
      console.error("Roles fetch error:", rolesError);
    }

    const { data: contributorRows, error: contributorsError } = await supabase
      .from("contributors")
      .select("name, role, role_id, deleted_at");

    if (contributorsError) {
      console.error("Roles contributors fetch error:", contributorsError);
    }

    const roles = (roleRows ?? []) as { id: string; name: string }[];
    const contributors = (contributorRows ?? []) as {
      name?: string;
      role?: string | null;
      role_id?: string | null;
      deleted_at?: string | null;
    }[];
    const active = contributors.filter((c) => c.deleted_at == null);

    initialRoles = roles.map((r) => {
      const name = String(r.name ?? "");
      const memberNames = active
        .filter((c) => String(c.role_id ?? "") === String(r.id) || String(c.role ?? "") === name)
        .map((c) => String(c.name ?? ""))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return {
        id: String(r.id ?? ""),
        name,
        memberCount: memberNames.length,
        memberNames,
      };
    });
  }

  return <RolesSettingsPage initialRoles={initialRoles} />;
}
