import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveContributorRoleFields } from "@/lib/workspace/resolveContributorRoleFields";
import {
  isPaidPermissionLevel,
  mapInvitePermissionLevel,
  normalizeTeammatePermissionFields,
  normalizeWorkspacePermission,
  toStoredPermissionLevel,
  type ContentPermissionLevel,
  type WorkspacePermissionLevel,
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
  /** From workspace_members.permission_level (admin | editor | reviewer). */
  workspacePermissionLevel?: WorkspacePermissionLevel;
  /** workspace_members.role — admin | member (internal; used for Admin flag content role). */
  workspaceMemberRole?: "admin" | "member" | null;
  /** Content permission when workspacePermissionLevel is admin (Editor or Reviewer pill). */
  adminContentPermission?: ContentPermissionLevel;
  isAdmin: boolean;
  isPaid: boolean;
  isPending: boolean;
  /** Pending row from workspace_invites (not yet accepted). */
  isPendingInvite?: boolean;
  inviteCode?: string;
  memberId?: string;
  userId?: string | null;
  /** From workspace_members.status (active | pending). */
  memberStatus?: string | null;
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
  permission_level?: string | null;
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

function memberPermissionsFromWorkspaceLevel(permissionLevelRaw: unknown) {
  const stored = normalizeWorkspacePermission(permissionLevelRaw);
  const { contentPermissionLevel, isAdmin } = normalizeTeammatePermissionFields(stored);
  return {
    stored,
    contentPermissionLevel,
    isAdmin,
    isPaid: isPaidPermissionLevel(stored),
  };
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function displayNameForMember(
  member: WorkspaceMemberRow,
  contributor?: ContributorRow,
): string {
  const contributorName = String(contributor?.name ?? "").trim();
  if (contributorName && !isUuidLike(contributorName)) {
    return contributorName;
  }
  const inviteEmail = member.invite_email?.trim() || null;
  if (inviteEmail) return inviteEmail;
  const contributorEmail = String(contributor?.email ?? "").trim();
  if (contributorEmail && !isUuidLike(contributorEmail)) {
    return contributorEmail;
  }
  return member.status === "pending" || !member.user_id ? "Pending invite" : "Team member";
}

const INTERNAL_JOB_ROLES = new Set(["viewer"]);

function isDisplayableJobRole(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (!text) return false;
  return !INTERNAL_JOB_ROLES.has(text.toLowerCase());
}

function jobRoleTextFromContributor(contributor: ContributorRow): string | null {
  if (!isDisplayableJobRole(contributor.role)) return null;
  return String(contributor.role).trim();
}

function contributorMatchesMember(
  contributor: ContributorRow,
  member: WorkspaceMemberRow,
  memberEmails: Set<string>,
): boolean {
  const memberUserId = member.user_id == null ? "" : String(member.user_id).trim();
  const contributorUserId = String(contributor.user_id ?? "").trim();
  if (memberUserId && contributorUserId === memberUserId) {
    return true;
  }
  const contributorEmail = String(contributor.email ?? "").trim().toLowerCase();
  return Boolean(contributorEmail && memberEmails.has(contributorEmail));
}

function memberEmailKeys(
  member: WorkspaceMemberRow,
  contributors: ContributorRow[],
): Set<string> {
  const emails = new Set<string>();
  const inviteEmail = member.invite_email?.trim().toLowerCase();
  if (inviteEmail) emails.add(inviteEmail);

  const memberUserId = member.user_id == null ? "" : String(member.user_id).trim();
  if (memberUserId) {
    for (const contributor of contributors) {
      if (String(contributor.user_id ?? "").trim() !== memberUserId) continue;
      const email = String(contributor.email ?? "").trim().toLowerCase();
      if (email) emails.add(email);
    }
  }
  return emails;
}

/** Job title from contributors.role across all workspace/project rows for the member. */
export function resolveJobRoleDisplay(
  member: WorkspaceMemberRow,
  contributors: ContributorRow[],
): string | null {
  const emails = memberEmailKeys(member, contributors);
  const matching = contributors.filter((contributor) =>
    contributorMatchesMember(contributor, member, emails),
  );
  if (matching.length === 0) return null;

  const validRoles = matching
    .map((contributor) => ({
      contributor,
      role: jobRoleTextFromContributor(contributor),
    }))
    .filter((entry): entry is { contributor: ContributorRow; role: string } =>
      entry.role != null,
    );

  if (validRoles.length === 0) return null;

  validRoles.sort((left, right) => {
    const timeDiff =
      contributorCreatedAtMs(right.contributor) - contributorCreatedAtMs(left.contributor);
    if (timeDiff !== 0) return timeDiff;
    return String(right.contributor.id ?? "").localeCompare(String(left.contributor.id ?? ""));
  });

  return validRoles[0].role;
}

function resolveAdminContentPermission(
  member: WorkspaceMemberRow,
  contributor?: ContributorRow,
): ContentPermissionLevel {
  const memberRole = String(member.role ?? "").trim().toLowerCase();
  if (memberRole === "admin") {
    return "editor";
  }
  if (contributor) {
    const stored = normalizeWorkspacePermission(contributor.permission_level);
    if (stored === "editor" || stored === "reviewer") {
      return stored;
    }
    if (stored === "admin") {
      return normalizeTeammatePermissionFields(stored).contentPermissionLevel;
    }
  }
  return "reviewer";
}

function contributorCreatedAtMs(contributor: ContributorRow): number {
  const parsed = Date.parse(String(contributor.created_at ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** One canonical contributor row per auth user (workspace profile, earliest created_at). */
function buildContributorsByUserId(contributors: ContributorRow[]): Map<string, ContributorRow> {
  const sorted = [...contributors].sort((left, right) => {
    const timeDiff = contributorCreatedAtMs(left) - contributorCreatedAtMs(right);
    if (timeDiff !== 0) return timeDiff;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });

  const byUserId = new Map<string, ContributorRow>();
  for (const contributor of sorted) {
    const userId = contributor.user_id;
    if (userId == null || String(userId).trim() === "") continue;
    const uid = String(userId);
    const existing = byUserId.get(uid);
    const isWorkspaceProfile = contributor.project_id == null;
    const existingIsWorkspaceProfile = existing?.project_id == null;
    if (!existing || (isWorkspaceProfile && !existingIsWorkspaceProfile)) {
      byUserId.set(uid, contributor);
    }
  }
  return byUserId;
}

function buildContributorsByEmail(contributors: ContributorRow[]): Map<string, ContributorRow> {
  const sorted = [...contributors].sort((left, right) => {
    const timeDiff = contributorCreatedAtMs(left) - contributorCreatedAtMs(right);
    if (timeDiff !== 0) return timeDiff;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });

  const byEmail = new Map<string, ContributorRow>();
  for (const contributor of sorted) {
    const email =
      contributor.email == null ? "" : String(contributor.email).trim().toLowerCase();
    if (!email) continue;
    const existing = byEmail.get(email);
    const isWorkspaceProfile = contributor.project_id == null;
    const existingIsWorkspaceProfile = existing?.project_id == null;
    if (!existing || (isWorkspaceProfile && !existingIsWorkspaceProfile)) {
      byEmail.set(email, contributor);
    }
  }
  return byEmail;
}

function resolveContributorForMember(
  member: WorkspaceMemberRow,
  contributorsByUserId: Map<string, ContributorRow>,
  contributorsByEmail: Map<string, ContributorRow>,
): ContributorRow | undefined {
  const userId = member.user_id == null ? "" : String(member.user_id).trim();
  if (userId) {
    return contributorsByUserId.get(userId);
  }
  const inviteEmail = member.invite_email?.trim().toLowerCase() || "";
  if (inviteEmail) {
    return contributorsByEmail.get(inviteEmail);
  }
  return undefined;
}

export function buildWorkspaceTeammates(
  members: WorkspaceMemberRow[],
  contributors: ContributorRow[],
): WorkspaceTeammate[] {
  const contributorsByUserId = buildContributorsByUserId(contributors);
  const contributorsByEmail = buildContributorsByEmail(contributors);

  const teammates: WorkspaceTeammate[] = [];

  for (const member of members) {
    const memberStatus = String(member.status ?? "").trim().toLowerCase() || null;
    const isPending = memberStatus === "pending" || !member.user_id;
    const perms = memberPermissionsFromWorkspaceLevel(member.permission_level);
    const contributor = resolveContributorForMember(
      member,
      contributorsByUserId,
      contributorsByEmail,
    );
    const displayName = displayNameForMember(member, contributor);
    const inviteEmail = member.invite_email?.trim() || null;
    const jobRole = resolveJobRoleDisplay(member, contributors);
    const workspaceMemberRole =
      String(member.role ?? "").trim().toLowerCase() === "admin" ? "admin" : "member";
    const adminContentPermission =
      perms.stored === "admin"
        ? resolveAdminContentPermission(member, contributor)
        : undefined;

    if (isPending) {
      teammates.push({
        id: `pending-${member.id}`,
        memberId: member.id,
        name: displayName,
        email: inviteEmail ?? (contributor?.email ? String(contributor.email) : null),
        roleId: contributor?.role_id == null ? null : String(contributor.role_id),
        roleName: jobRole,
        permissionLevel: perms.contentPermissionLevel,
        workspacePermissionLevel: perms.stored,
        workspaceMemberRole,
        adminContentPermission,
        isAdmin: perms.isAdmin,
        isPaid: perms.isPaid,
        isPending: true,
        memberStatus,
        userId: null,
      });
      continue;
    }

    const userId = String(member.user_id);

    if (contributor) {
      const mapped = mapContributorToTeammate(contributor);
      teammates.push({
        ...mapped,
        name: displayName,
        roleName: jobRole,
        permissionLevel: perms.contentPermissionLevel,
        workspacePermissionLevel: perms.stored,
        workspaceMemberRole,
        adminContentPermission,
        isAdmin: perms.isAdmin,
        isPaid: perms.isPaid,
        isPending: false,
        memberStatus,
        memberId: member.id,
        userId: String(member.user_id ?? userId),
      });
      continue;
    }

    teammates.push({
      id: `member-${member.id}`,
      memberId: member.id,
      userId: String(member.user_id),
      name: displayName,
      email: inviteEmail,
      roleId: null,
      roleName: jobRole,
      permissionLevel: perms.contentPermissionLevel,
      workspacePermissionLevel: perms.stored,
      workspaceMemberRole,
      adminContentPermission,
      isAdmin: perms.isAdmin,
      isPaid: perms.isPaid,
      isPending: false,
      memberStatus,
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

    const jobRole =
      typeof invite.job_role === "string" && invite.job_role.trim()
        ? invite.job_role.trim()
        : null;
    const existingRole = String(row.role ?? "").trim();
    const shouldUpdateRole =
      Boolean(jobRole) &&
      (!existingRole || existingRole.toLowerCase() === "viewer");

    if (shouldUpdateRole && jobRole) {
      const roleFields = await resolveContributorRoleFields(supabase, jobRole);
      const { data: updated, error: updateError } = await supabase
        .from("contributors")
        .update({
          role: roleFields.role,
          role_id: roleFields.role_id,
        })
        .eq("id", String(row.id ?? ""))
        .select("id, name, email, role, user_id, workspace_id, project_id, created_at")
        .maybeSingle();

      if (!updateError && updated) {
        return updated as Record<string, unknown>;
      }
    }

    return row;
  }

  const invitedName =
    typeof invite.invited_name === "string" ? invite.invited_name.trim() : "";
  const displayName = invitedName || email.split("@")[0] || "Pending teammate";
  const jobRole =
    typeof invite.job_role === "string" && invite.job_role.trim()
      ? invite.job_role.trim()
      : null;
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
    const stored = mapInvitePermissionLevel(row.role);
    const { contentPermissionLevel, isAdmin } = normalizeTeammatePermissionFields(stored);
    const displayJobRole = isDisplayableJobRole(jobRole) ? jobRole : null;
    return {
      id: `invite-${row.id}`,
      name: invitedName || email,
      email,
      roleId: null,
      roleName: displayJobRole,
      permissionLevel: contentPermissionLevel,
      workspacePermissionLevel: stored,
      adminContentPermission: stored === "admin" ? contentPermissionLevel : undefined,
      isAdmin,
      isPaid: false,
      isPending: true,
      isPendingInvite: true,
      inviteCode: String(row.invite_code ?? ""),
      memberStatus: "pending",
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
