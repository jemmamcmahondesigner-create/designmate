import { TeammatesSettingsPage } from "@/components/settings/TeammatesSettingsPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export default async function SettingsTeammatesPage() {
  const supabase = await createSupabaseServerClient();

  const { data: rawRows, error: teammatesError } = await supabase
    .from("contributors")
    .select("id, name, email, role, role_id, permission_level, is_paid, deleted_at, contributor_roles(name)")
    .order("name", { ascending: true });

  let teammateData: Record<string, unknown>[] = (rawRows ?? []) as Record<string, unknown>[];

  if (teammatesError) {
    const retry = await supabase
      .from("contributors")
      .select("id, name, email, role, role_id, permission_level, is_paid, contributor_roles(name)")
      .order("name", { ascending: true });
    teammateData = (retry.data ?? []) as Record<string, unknown>[];
  }

  const visibleRows = teammateData.filter((item) => {
    if (!("deleted_at" in item)) return true;
    return item.deleted_at == null;
  });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: rolesRows, error: rolesError } = await adminClient
    .from("contributor_roles")
    .select("id, name")
    .order("name", { ascending: true });

  console.log("contributor_roles raw:", rolesRows);
  console.log("contributor_roles error:", rolesError);

  const initialContributorRoles = (rolesRows ?? [])
    .map((row) => {
      const o = row as Record<string, unknown>;
      return { id: String(o.id ?? ""), name: String(o.name ?? "") };
    })
    .filter((r) => r.id.trim() !== "" && r.name.trim() !== "");

  console.log("initialContributorRoles mapped:", initialContributorRoles);

  const initialTeammates = visibleRows.map((item) => {
    const roleJoin = item.contributor_roles as { name?: string } | null;
    const permission = String(item.permission_level ?? "editor").toLowerCase();
    const permissionLevel: "admin" | "editor" | "reviewer" =
      permission === "admin" || permission === "reviewer" ? permission : "editor";
    const roleNameFromJoin = roleJoin?.name ?? null;
    const roleName =
      roleNameFromJoin && String(roleNameFromJoin).trim() !== ""
        ? String(roleNameFromJoin)
        : item.role == null || String(item.role).trim() === ""
          ? null
          : String(item.role);
    return {
      id: String(item.id ?? ""),
      name: String(item.name ?? ""),
      email: item.email == null ? null : String(item.email),
      roleId: item.role_id == null ? null : String(item.role_id),
      roleName,
      permissionLevel,
      isPaid: item.is_paid == null ? true : Boolean(item.is_paid),
    };
  });

  return (
    <TeammatesSettingsPage
      initialTeammates={initialTeammates}
      initialContributorRoles={initialContributorRoles}
    />
  );
}
