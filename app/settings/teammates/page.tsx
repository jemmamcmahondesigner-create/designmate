import { TeammatesSettingsPage } from "@/components/settings/TeammatesSettingsPage";
import {
  appendPendingWorkspaceInvites,
  buildWorkspaceTeammates,
  mapPendingWorkspaceInvites,
} from "@/lib/workspace/teammates";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { fetchWorkspaceRoleOptions } from "@/lib/workspace/contributorRoles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectReviewerFromTeammatesSettings } from "@/lib/workspace/settingsAccess";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceTeammate } from "@/lib/workspace/teammates";

function sortTeammatesByName(rows: WorkspaceTeammate[]): WorkspaceTeammate[] {
  return [...rows].sort((a, b) => {
    const nameA = a.name?.trim() || "zzz";
    const nameB = b.name?.trim() || "zzz";
    return nameA.localeCompare(nameB);
  });
}

const CONTRIBUTOR_PROFILE_SELECT =
  "id, name, email, role, role_id, permission_level, is_paid, deleted_at, user_id, project_id, contributor_roles(name)";

const CONTRIBUTOR_PROFILE_SELECT_NO_DELETED =
  "id, name, email, role, role_id, permission_level, is_paid, user_id, project_id, contributor_roles(name)";

async function loadWorkspaceTeammateRows(
  adminClient: SupabaseClient,
  supabase: SupabaseClient,
  activeWorkspaceId: string,
): Promise<WorkspaceTeammate[]> {
  // Service role: RLS on workspace_members only exposes the viewer's own row via
  // the user client, so admins would miss other teammates (e.g. Marcus).
  const { data: members, error: membersError } = await adminClient
    .from("workspace_members")
    .select("id, role, status, joined_at, invite_email, user_id")
    .eq("workspace_id", activeWorkspaceId)
    .order("joined_at", { ascending: true });

  if (membersError) {
    console.error("workspace_members fetch error:", membersError);
  }

  const memberRows = (members ?? []) as Parameters<typeof buildWorkspaceTeammates>[0];
  const userIds = memberRows
    .map((member) => String(member.user_id ?? "").trim())
    .filter(Boolean);

  let visibleContributors: Record<string, unknown>[] = [];

  if (userIds.length > 0) {
    const { data: contributorRows, error: contributorsError } = await supabase
      .from("contributors")
      .select(CONTRIBUTOR_PROFILE_SELECT)
      .in("user_id", userIds)
      .eq("workspace_id", activeWorkspaceId);

    if (contributorsError) {
      const retry = await supabase
        .from("contributors")
        .select(CONTRIBUTOR_PROFILE_SELECT_NO_DELETED)
        .in("user_id", userIds)
        .eq("workspace_id", activeWorkspaceId);
      if (!retry.error) {
        visibleContributors = (retry.data ?? []) as Record<string, unknown>[];
      }
    } else {
      visibleContributors = ((contributorRows ?? []) as Record<string, unknown>[]).filter(
        (item) => !("deleted_at" in item) || item.deleted_at == null,
      );
    }
  }

  return buildWorkspaceTeammates(memberRows, visibleContributors);
}

export default async function SettingsTeammatesPage() {
  await redirectReviewerFromTeammatesSettings();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const activeWorkspaceId = getActiveWorkspaceIdFromUser(user);

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const initialContributorRoles = await fetchWorkspaceRoleOptions(
    adminClient,
    activeWorkspaceId,
  );

  if (!activeWorkspaceId) {
    return (
      <TeammatesSettingsPage
        initialTeammates={[]}
        initialContributorRoles={initialContributorRoles}
        noWorkspace
      />
    );
  }

  const teammates = await loadWorkspaceTeammateRows(
    adminClient,
    supabase,
    activeWorkspaceId,
  );

  const { data: pendingInvites } = await supabase
    .from("workspace_invites")
    .select("id, email, role, created_at, invite_code, invited_name, job_role")
    .eq("workspace_id", activeWorkspaceId)
    .eq("status", "pending");

  const initialTeammates = sortTeammatesByName(
    appendPendingWorkspaceInvites(
      teammates,
      mapPendingWorkspaceInvites((pendingInvites ?? []) as Parameters<typeof mapPendingWorkspaceInvites>[0]),
    ),
  );

  return (
    <TeammatesSettingsPage
      initialTeammates={initialTeammates}
      initialContributorRoles={initialContributorRoles}
      activeWorkspaceId={activeWorkspaceId}
    />
  );
}
