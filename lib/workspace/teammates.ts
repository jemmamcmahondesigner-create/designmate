import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveContributorRoleFields } from "@/lib/workspace/resolveContributorRoleFields";
import {
  isPaidPermissionLevel,
  mapInvitePermissionLevel,
  normalizeTeammatePermissionFields,
  toStoredPermissionLevel,
  type ContentPermissionLevel,
} from "@/lib/workspace/permissions";

export type WorkspaceContributorPickerOption = {
  id: string;
  name: string;
  role: string;
  userId: string;
  email: string | null;
  /** True when the teammate has been invited but has not signed in yet. */
  isPending?: boolean;
};

export type WorkspaceTeammate = {
  id: string;
  name: string;
  email: string | null;
  roleId: string | null;
  roleName: string | null;
  permissionLevel: ContentPermissionLevel;
  isAdmin: boolean;
  isPaid: boolean;
  isPending: boolean;
  /** Pending row from workspace_invites (not yet accepted). */
  isPendingInvite?: boolean;
  inviteCode?: string;
  memberId?: string;
  userId?: string | null;
};

export type PendingWorkspaceInviteRow = {
  id: string;
  email: string;
  role: string;
  invite_code: string;
  invited_name?: string | null;
  job_role?: string | null;
};

type WorkspaceMemberRow = {
  id: string;
  role: string;
  status: string;
  joined_at: string | null;
  invite_email: string | null;
  user_id: string | null;
};

type ContributorRow = Record<string, unknown>;

function mapContributorToTeammate(item: ContributorRow): Omit<WorkspaceTeammate, "isPending" | "memberId"> {
  const roleJoin = item.contributor_roles as { name?: string } | null;
  const { contentPermissionLevel, isAdmin } = normalizeTeammatePermissionFields(
    item.permission_level,
    item.is_admin,
  );
  const storedLevel = toStoredPermissionLevel(contentPermissionLevel, isAdmin);
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
    permissionLevel: contentPermissionLevel,
    isAdmin,
    isPaid: isPaidPermissionLevel(storedLevel),
    userId: item.user_id == null ? null : String(item.user_id),
  };
}

function memberTeammatePermissions(memberRole: string) {
  return normalizeTeammatePermissionFields(memberRole === "admin" ? "admin" : "reviewer");
}

export function buildWorkspaceTeammates(
  members: WorkspaceMemberRow[],
  contributors: ContributorRow[],
): WorkspaceTeammate[] {
  const contributorsByUserId = new Map<string, ContributorRow>();
  const contributorsByEmail = new Map<string, ContributorRow>();

  for (const contributor of contributors) {
    const userId = contributor.user_id;
    if (userId != null && String(userId).trim() !== "") {
      const uid = String(userId);
      const existing = contributorsByUserId.get(uid);
      const isWorkspaceProfile = contributor.project_id == null;
      const existingIsWorkspaceProfile = existing?.project_id == null;
      if (!existing || (isWorkspaceProfile && !existingIsWorkspaceProfile)) {
        contributorsByUserId.set(uid, contributor);
      }
    }
    const email =
      contributor.email == null ? "" : String(contributor.email).trim().toLowerCase();
    if (email) {
      const existingByEmail = contributorsByEmail.get(email);
      const isWorkspaceProfile = contributor.project_id == null;
      const existingIsWorkspaceProfile = existingByEmail?.project_id == null;
      if (!existingByEmail || (isWorkspaceProfile && !existingIsWorkspaceProfile)) {
        contributorsByEmail.set(email, contributor);
      }
    }
  }

  const teammates: WorkspaceTeammate[] = [];

  for (const member of members) {
    const isPending = member.status === "pending" || !member.user_id;

    if (isPending) {
      const inviteEmail = member.invite_email?.trim() || null;
      const pendingPerms = memberTeammatePermissions(member.role);
      teammates.push({
        id: `pending-${member.id}`,
        memberId: member.id,
        name: inviteEmail ?? "Pending invite",
        email: inviteEmail,
        roleId: null,
        roleName: null,
        permissionLevel: pendingPerms.contentPermissionLevel,
        isAdmin: pendingPerms.isAdmin,
        isPaid: false,
        isPending: true,
      });
      continue;
    }

    const userId = String(member.user_id);
    const contributor =
      contributorsByUserId.get(userId) ??
      (member.invite_email
        ? contributorsByEmail.get(member.invite_email.trim().toLowerCase())
        : undefined);

    if (contributor) {
      const mapped = mapContributorToTeammate(contributor);
      teammates.push({
        ...mapped,
        isPending: false,
        memberId: member.id,
        // Always hash avatars on auth user id from workspace_members, not contributor row.
        userId: String(member.user_id ?? userId),
      });
      continue;
    }

    const memberPerms = memberTeammatePermissions(member.role);
    const memberStored = toStoredPermissionLevel(
      memberPerms.contentPermissionLevel,
      memberPerms.isAdmin,
    );
    teammates.push({
      id: `member-${member.id}`,
      memberId: member.id,
      userId: String(member.user_id),
      name: "Team member",
      email: member.invite_email,
      roleId: null,
      roleName: null,
      permissionLevel: memberPerms.contentPermissionLevel,
      isAdmin: memberPerms.isAdmin,
      isPaid: isPaidPermissionLevel(memberStored),
      isPending: false,
    });
  }

  return teammates;
}

function mapProfileToPickerOption(
  profile: Record<string, unknown>,
  isPending: boolean,
): WorkspaceContributorPickerOption {
  const userId = String(profile.user_id ?? "").trim();
  return {
    id: String(profile.id ?? ""),
    name: String(profile.name ?? ""),
    role: String(profile.role ?? ""),
    userId,
    email:
      profile.email == null || String(profile.email).trim() === ""
        ? null
        : String(profile.email).trim(),
    isPending,
  };
}

function contributorProfileMatchesWorkspace(
  profile: Record<string, unknown>,
  workspaceId: string,
): boolean {
  return String(profile.workspace_id ?? "").trim() === workspaceId.trim();
}

/** Workspace contributor row for a pending invite (no auth user yet). */
export async function ensurePendingInviteContributor(
  supabase: SupabaseClient,
  workspaceId: string,
  invite: {
    email: string;
    invited_name?: string | null;
    job_role?: string | null;
    role?: string;
  },
): Promise<Record<string, unknown> | null> {
  const email = String(invite.email ?? "").trim().toLowerCase();
  if (!email) return null;

  const { data: existing } = await supabase
    .from("contributors")
    .select("id, name, email, role, user_id, workspace_id, project_id, created_at")
    .eq("workspace_id", workspaceId)
    .is("project_id", null)
    .ilike("email", email)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const row = existing as Record<string, unknown>;
    if (!contributorProfileMatchesWorkspace(row, workspaceId)) {
      return null;
    }
    return row;
  }

  const invitedName =
    typeof invite.invited_name === "string" ? invite.invited_name.trim() : "";
  const displayName = invitedName || email.split("@")[0] || "Pending teammate";
  const jobRole =
    typeof invite.job_role === "string" && invite.job_role.trim()
      ? invite.job_role.trim()
      : "Reviewer";
  const permissionLevel = mapInvitePermissionLevel(invite.role);
  const roleFields = await resolveContributorRoleFields(supabase, jobRole);

  const { data: inserted, error } = await supabase
    .from("contributors")
    .insert({
      name: displayName,
      email,
      role: roleFields.role,
      role_id: roleFields.role_id,
      permission_level: permissionLevel,
      is_paid: isPaidPermissionLevel(permissionLevel),
      project_id: null,
      workspace_id: workspaceId,
      user_id: null,
    })
    .select("id, name, email, role, user_id, workspace_id, project_id, created_at")
    .single();

  if (error || !inserted) {
    console.error("ensurePendingInviteContributor insert failed:", error);
    return null;
  }

  return inserted as Record<string, unknown>;
}

function dedupeWorkspaceContributorProfiles(
  profiles: Array<Record<string, unknown>>,
  workspaceId: string,
  excludeUserIds: Set<string>,
): WorkspaceContributorPickerOption[] {
  const profilesByUserId = new Map<string, Record<string, unknown>>();

  const sortedProfiles = [...profiles]
    .filter((profile) => contributorProfileMatchesWorkspace(profile, workspaceId))
    .sort((left, right) => {
    const leftTime = Date.parse(String(left.created_at ?? ""));
    const rightTime = Date.parse(String(right.created_at ?? ""));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });

  for (const profile of sortedProfiles) {
    const userId = String(profile.user_id ?? "").trim();
    if (!userId || excludeUserIds.has(userId)) continue;
    if (!profilesByUserId.has(userId)) {
      profilesByUserId.set(userId, profile);
    }
  }

  return Array.from(profilesByUserId.values())
    .map((profile) => mapProfileToPickerOption(profile, false))
    .filter((row) => row.id && row.userId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Active workspace members plus invited-but-unsigned-in teammates. */
export async function fetchWorkspaceContributorPickerOptions(
  supabase: SupabaseClient,
  workspaceId: string,
  options?: {
    excludeUserIds?: Iterable<string>;
    excludeContributorIds?: Iterable<string>;
  },
): Promise<WorkspaceContributorPickerOption[]> {
  const scopedWorkspaceId = workspaceId.trim();
  if (!scopedWorkspaceId) return [];

  const excludeUserIds = new Set(options?.excludeUserIds ?? []);
  const excludeContributorIds = new Set(options?.excludeContributorIds ?? []);

  const { data: workspaceMembers } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", scopedWorkspaceId)
    .eq("status", "active");

  const userIds = (workspaceMembers ?? [])
    .map((member) =>
      String((member as { user_id?: string }).user_id ?? "").trim(),
    )
    .filter(Boolean);

  const activeProfiles: Record<string, unknown>[] = [];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("contributors")
      .select("id, name, email, role, user_id, workspace_id, project_id, created_at")
      .in("user_id", userIds)
      .eq("workspace_id", scopedWorkspaceId);
    activeProfiles.push(
      ...((profiles ?? []) as Record<string, unknown>[]).filter((profile) =>
        contributorProfileMatchesWorkspace(profile, scopedWorkspaceId),
      ),
    );
  }

  const activeOptions = dedupeWorkspaceContributorProfiles(
    activeProfiles,
    scopedWorkspaceId,
    excludeUserIds,
  ).filter((row) => !excludeContributorIds.has(row.id));

  const activeEmails = new Set(
    activeOptions
      .map((row) => row.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );

  const { data: pendingProfiles } = await supabase
    .from("contributors")
    .select("id, name, email, role, user_id, workspace_id, project_id, created_at")
    .eq("workspace_id", scopedWorkspaceId)
    .is("project_id", null)
    .is("user_id", null);

  const pendingById = new Map<string, WorkspaceContributorPickerOption>();
  for (const profile of (pendingProfiles ?? []) as Record<string, unknown>[]) {
    if (!contributorProfileMatchesWorkspace(profile, scopedWorkspaceId)) continue;
    const id = String(profile.id ?? "").trim();
    if (!id || excludeContributorIds.has(id)) continue;
    const email =
      profile.email == null ? "" : String(profile.email).trim().toLowerCase();
    if (email && activeEmails.has(email)) continue;
    pendingById.set(id, mapProfileToPickerOption(profile, true));
  }

  const { data: pendingInvites } = await supabase
    .from("workspace_invites")
    .select("id, email, role, invited_name, job_role")
    .eq("workspace_id", scopedWorkspaceId)
    .eq("status", "pending");

  for (const invite of (pendingInvites ?? []) as Array<{
    email?: string;
    role?: string;
    invited_name?: string | null;
    job_role?: string | null;
  }>) {
    const email = String(invite.email ?? "").trim().toLowerCase();
    if (!email || activeEmails.has(email)) continue;
    const alreadyListed = Array.from(pendingById.values()).some(
      (row) => row.email?.trim().toLowerCase() === email,
    );
    if (alreadyListed) continue;

    const profile = await ensurePendingInviteContributor(supabase, scopedWorkspaceId, {
      email,
      invited_name: invite.invited_name,
      job_role: invite.job_role,
      role: invite.role,
    });
    if (!profile || !contributorProfileMatchesWorkspace(profile, scopedWorkspaceId)) continue;
    const id = String(profile.id ?? "").trim();
    if (!id || excludeContributorIds.has(id)) continue;
    pendingById.set(id, mapProfileToPickerOption(profile, true));
  }

  return [...activeOptions, ...Array.from(pendingById.values())].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function mapPendingWorkspaceInvites(
  rows: PendingWorkspaceInviteRow[],
): WorkspaceTeammate[] {
  return rows.map((row) => {
    const email = String(row.email ?? "").trim();
    const invitedName =
      typeof row.invited_name === "string" ? row.invited_name.trim() : "";
    const jobRole = typeof row.job_role === "string" ? row.job_role.trim() : "";
    const { contentPermissionLevel, isAdmin } = normalizeTeammatePermissionFields(
      mapInvitePermissionLevel(row.role),
    );
    return {
      id: `invite-${row.id}`,
      name: invitedName,
      email,
      roleId: null,
      roleName: jobRole || null,
      permissionLevel: contentPermissionLevel,
      isAdmin,
      isPaid: false,
      isPending: true,
      isPendingInvite: true,
      inviteCode: String(row.invite_code ?? ""),
    };
  });
}

export function appendPendingWorkspaceInvites(
  teammates: WorkspaceTeammate[],
  pendingInvites: WorkspaceTeammate[],
): WorkspaceTeammate[] {
  if (pendingInvites.length === 0) return teammates;

  const existingEmails = new Set(
    teammates
      .map((row) => row.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );

  const uniquePending = pendingInvites.filter((row) => {
    const email = row.email?.trim().toLowerCase();
    return email && !existingEmails.has(email);
  });

  return [...teammates, ...uniquePending];
}
