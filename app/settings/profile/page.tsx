import { ProfileSettingsPage } from "@/components/settings/ProfileSettingsPage";
import { getDevImpersonatedContributorId } from "@/lib/auth/devImpersonation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsProfilePage() {
  const contributorId = await getDevImpersonatedContributorId();
  const supabase = await createSupabaseServerClient();

  if (!contributorId) {
    return <ProfileSettingsPage contributor={null} />;
  }

  const { data } = await supabase
    .from("contributors")
    .select("id, name, email, role, role_id, contributor_roles(name)")
    .eq("id", contributorId)
    .maybeSingle();

  if (!data) {
    return <ProfileSettingsPage contributor={null} />;
  }

  const raw = data as Record<string, unknown>;
  const roleJoin = raw.contributor_roles as { name?: string } | null;
  const roleNameFromJoin = roleJoin?.name ?? null;
  const roleName =
    roleNameFromJoin && String(roleNameFromJoin).trim() !== ""
      ? String(roleNameFromJoin)
      : raw.role == null || String(raw.role).trim() === ""
        ? null
        : String(raw.role);

  const contributor = {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    email: raw.email == null ? null : String(raw.email),
    roleId: raw.role_id == null ? null : String(raw.role_id),
    roleName,
  };

  return <ProfileSettingsPage contributor={contributor} />;
}
