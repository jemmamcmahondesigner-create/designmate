import {
  isPaidPermissionLevel,
  normalizeWorkspacePermission,
  type WorkspacePermissionLevel,
} from "@/lib/workspace/permissions";

export type WorkspaceTeammate = {
  id: string;
  name: string;
  email: string | null;
  roleId: string | null;
  roleName: string | null;
  permissionLevel: WorkspacePermissionLevel;
  isPaid: boolean;
  isPending: boolean;
  memberId?: string;
  userId?: string | null;
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
  const permissionLevel = normalizeWorkspacePermission(item.permission_level);
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
    isPaid: isPaidPermissionLevel(permissionLevel),
    userId: item.user_id == null ? null : String(item.user_id),
  };
}

function memberPermissionLevel(memberRole: string): WorkspacePermissionLevel {
  return memberRole === "admin" ? "admin" : "reviewer";
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
      teammates.push({
        id: `pending-${member.id}`,
        memberId: member.id,
        name: inviteEmail ?? "Pending invite",
        email: inviteEmail,
        roleId: null,
        roleName: null,
        permissionLevel: memberPermissionLevel(member.role),
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

    teammates.push({
      id: `member-${member.id}`,
      memberId: member.id,
      userId,
      name: "Team member",
      email: member.invite_email,
      roleId: null,
      roleName: null,
      permissionLevel: memberPermissionLevel(member.role),
      isPaid: isPaidPermissionLevel(memberPermissionLevel(member.role)),
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
