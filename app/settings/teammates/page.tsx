import { TeammatesSettingsPage } from "@/components/settings/TeammatesSettingsPage";
import {
  appendPendingWorkspaceInvites,
  buildWorkspaceTeammates,
  mapPendingWorkspaceInvites,
} from "@/lib/workspace/teammates";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export default async function SettingsTeammatesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const activeWorkspaceId = getActiveWorkspaceIdFromUser(user);

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: rolesRows, error: rolesError } = await adminClient
    .from("contributor_roles")
    .select("id, name")
    .order("name", { ascending: true });

  if (process.env.NODE_ENV === "development") {
    console.log("contributor_roles raw:", rolesRows);
    console.log("contributor_roles error:", rolesError);
  }

  const initialContributorRoles = (rolesRows ?? [])
    .map((row) => {
      const o = row as Record<string, unknown>;
      return { id: String(o.id ?? ""), name: String(o.name ?? "") };
    })
    .filter((r) => r.id.trim() !== "" && r.name.trim() !== "");

  if (!activeWorkspaceId) {
    return (
      <TeammatesSettingsPage
        initialTeammates={[]}
        initialContributorRoles={initialContributorRoles}
        noWorkspace
      />
    );
  }

  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select("id, role, status, joined_at, invite_email, user_id")
    .eq("workspace_id", activeWorkspaceId)
    .order("joined_at", { ascending: true });

  if (membersError) {
    console.error("workspace_members fetch error:", membersError);
  }

  const { data: contributorRows, error: contributorsError } = await supabase
    .from("contributors")
    .select(
      "id, name, email, role, role_id, permission_level, is_paid, deleted_at, user_id, contributor_roles(name)",
    )
    .eq("workspace_id", activeWorkspaceId);

  if (contributorsError) {
    const retry = await supabase
      .from("contributors")
      .select("id, name, email, role, role_id, permission_level, is_paid, user_id, contributor_roles(name)")
      .eq("workspace_id", activeWorkspaceId);
    if (!retry.error) {
      const visible = ((retry.data ?? []) as Record<string, unknown>[]).filter(
        (item) => !("deleted_at" in item) || item.deleted_at == null,
      );
      const teammates = buildWorkspaceTeammates(
        (members ?? []) as Parameters<typeof buildWorkspaceTeammates>[0],
        visible,
      );

      const { data: pendingInvites } = await supabase
        .from("workspace_invites")
        .select("id, email, role, created_at, invite_code, invited_name, job_role")
        .eq("workspace_id", activeWorkspaceId)
        .eq("status", "pending");

      const initialTeammates = appendPendingWorkspaceInvites(
        teammates,
        mapPendingWorkspaceInvites((pendingInvites ?? []) as Parameters<typeof mapPendingWorkspaceInvites>[0]),
      );

      return (
        <TeammatesSettingsPage
          initialTeammates={initialTeammates}
          initialContributorRoles={initialContributorRoles}
          activeWorkspaceId={activeWorkspaceId}
        />
      );
    }
  }

  const visibleContributors = ((contributorRows ?? []) as Record<string, unknown>[]).filter(
    (item) => !("deleted_at" in item) || item.deleted_at == null,
  );

  const teammates = buildWorkspaceTeammates(
    (members ?? []) as Parameters<typeof buildWorkspaceTeammates>[0],
    visibleContributors,
  );

  const { data: pendingInvites } = await supabase
    .from("workspace_invites")
    .select("id, email, role, created_at, invite_code, invited_name, job_role")
    .eq("workspace_id", activeWorkspaceId)
    .eq("status", "pending");

  const initialTeammates = appendPendingWorkspaceInvites(
    teammates,
    mapPendingWorkspaceInvites((pendingInvites ?? []) as Parameters<typeof mapPendingWorkspaceInvites>[0]),
  );

  return (
    <TeammatesSettingsPage
      initialTeammates={initialTeammates}
      initialContributorRoles={initialContributorRoles}
      activeWorkspaceId={activeWorkspaceId}
    />
  );
}
