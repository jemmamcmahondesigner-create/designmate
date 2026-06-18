import { ProfilePageClient } from "@/components/settings/ProfilePageClient";
import { fetchWorkspaceRoleOptions } from "@/lib/workspace/contributorRoles";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export default async function SettingsProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return (
      <ProfilePageClient
        userId={null}
        email={null}
        activeWorkspaceId={null}
        contributor={null}
        roleOptions={[]}
        workspaces={[]}
      />
    );
  }

  const activeWorkspaceId = getActiveWorkspaceIdFromUser(user);
  const email = user.email?.trim() || null;

  let contributor: { id: string; name: string; roleName: string | null } | null = null;

  if (activeWorkspaceId) {
    const { data: contributorRow } = await supabase
      .from("contributors")
      .select("id, name, role")
      .eq("user_id", user.id)
      .eq("workspace_id", activeWorkspaceId)
      .maybeSingle();

    if (contributorRow) {
      const raw = contributorRow as Record<string, unknown>;
      const roleRaw = raw.role;
      contributor = {
        id: String(raw.id ?? ""),
        name: String(raw.name ?? ""),
        roleName:
          roleRaw == null || String(roleRaw).trim() === ""
            ? null
            : String(roleRaw).trim(),
      };
    }
  }

  const roleOptions = await fetchWorkspaceRoleOptions(supabase, activeWorkspaceId);

  const { data: membershipRows } = await supabase
    .from("workspace_members")
    .select("role, status, workspace_id, workspaces(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const workspaceIds = (membershipRows ?? [])
    .map((row) => {
      const item = row as Record<string, unknown>;
      const workspaces = item.workspaces as { id?: string } | null;
      return String(item.workspace_id ?? workspaces?.id ?? "").trim();
    })
    .filter(Boolean);

  const adminCountByWorkspace: Record<string, number> = {};
  if (workspaceIds.length > 0) {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: adminRows } = await adminClient
      .from("workspace_members")
      .select("workspace_id")
      .in("workspace_id", workspaceIds)
      .eq("role", "admin")
      .eq("status", "active");

    for (const row of adminRows ?? []) {
      const workspaceId = String(
        (row as { workspace_id?: string }).workspace_id ?? "",
      ).trim();
      if (!workspaceId) continue;
      adminCountByWorkspace[workspaceId] =
        (adminCountByWorkspace[workspaceId] ?? 0) + 1;
    }
  }

  const workspaces = (membershipRows ?? [])
    .map((row) => {
      const item = row as Record<string, unknown>;
      const workspacesJoin = item.workspaces as { id?: string; name?: string } | null;
      const id = String(item.workspace_id ?? workspacesJoin?.id ?? "").trim();
      const name = String(workspacesJoin?.name ?? id).trim();
      const memberRole = String(item.role ?? "member").trim();
      if (!id) return null;
      const adminCount = adminCountByWorkspace[id] ?? 0;
      return {
        id,
        name: name || id,
        memberRole,
        status: String(item.status ?? "active"),
        isOnlyAdmin: memberRole === "admin" && adminCount <= 1,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return (
    <ProfilePageClient
      userId={user.id}
      email={email}
      activeWorkspaceId={activeWorkspaceId}
      contributor={contributor}
      roleOptions={roleOptions}
      workspaces={workspaces}
    />
  );
}
