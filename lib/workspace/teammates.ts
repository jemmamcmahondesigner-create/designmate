import {
  isPaidPermissionLevel,
  mapInvitePermissionLevel,
  normalizeTeammatePermissionFields,
  toStoredPermissionLevel,
  type ContentPermissionLevel,
} from "@/lib/workspace/permissions";

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
  const usedContributorIds = new Set<string>();

  for (const contributor of contributors) {
    const userId = contributor.user_id;
    if (userId != null && String(userId).trim() !== "") {
      contributorsByUserId.set(String(userId), contributor);
    }
    const email =
      contributor.email == null ? "" : String(contributor.email).trim().toLowerCase();
    if (email) {
      contributorsByEmail.set(email, contributor);
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
      usedContributorIds.add(mapped.id);
      teammates.push({
        ...mapped,
        isPending: false,
        memberId: member.id,
        userId,
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
      userId,
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

  for (const contributor of contributors) {
    const id = String(contributor.id ?? "");
    if (!id || usedContributorIds.has(id)) continue;
    if (contributor.deleted_at != null) continue;
    teammates.push({
      ...mapContributorToTeammate(contributor),
      isPending: false,
    });
  }

  return teammates;
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
