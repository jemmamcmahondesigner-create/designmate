import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  isPaidPermissionLevel,
  mapInvitePermissionLevel,
  mapWorkspaceMemberRole,
  normalizeWorkspacePermission,
  type WorkspacePermissionLevel,
} from "@/lib/workspace/permissions";
import { resolveContributorRoleFields } from "@/lib/workspace/resolveContributorRoleFields";

type MemberRow = {
  id: string;
  user_id: string | null;
  status: string | null;
  role: string | null;
  permission_level: string | null;
  invite_email: string | null;
  joined_at: string | null;
};

type ContributorRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
};

type PendingInviteRow = {
  id: string;
  role: string | null;
  status: string | null;
  expires_at: string | null;
  invited_name: string | null;
  job_role: string | null;
  email: string | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type ClaimWorkspaceMembershipInput = {
  workspaceId: string;
  userId: string;
  email: string | null;
  displayName?: string | null;
  jobRole?: string | null;
  /** Used only when no pending invite or pending member exists. */
  fallbackPermissionLevel?: WorkspacePermissionLevel;
};

export type ClaimWorkspaceMembershipResult =
  | {
      ok: true;
      workspaceId: string;
      workspaceName: string;
      permissionLevel: WorkspacePermissionLevel;
      alreadyMember: boolean;
    }
  | { ok: false; message: string };

function memberStatus(row: MemberRow | null | undefined): "active" | "pending" | null {
  if (!row) return null;
  const status = String(row.status ?? "").trim().toLowerCase();
  if (status === "active" && row.user_id) return "active";
  return "pending";
}

async function loadWorkspace(
  service: SupabaseClient,
  workspaceId: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await service
    .from("workspaces")
    .select("id, name")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!data?.id) return null;
  return { id: String(data.id), name: String(data.name ?? "Workspace") };
}

async function loadPendingInvite(
  service: SupabaseClient,
  workspaceId: string,
  email: string,
): Promise<PendingInviteRow | null> {
  if (!email) return null;
  const { data } = await service
    .from("workspace_invites")
    .select("id, role, status, expires_at, invited_name, job_role, email")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .ilike("email", email)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as PendingInviteRow | null) ?? null;
}

async function loadMemberByUserId(
  service: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<MemberRow | null> {
  const { data } = await service
    .from("workspace_members")
    .select("id, user_id, status, role, permission_level, invite_email, joined_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as MemberRow | null) ?? null;
}

async function loadMembersByInviteEmail(
  service: SupabaseClient,
  workspaceId: string,
  email: string,
): Promise<MemberRow[]> {
  if (!email) return [];
  const { data } = await service
    .from("workspace_members")
    .select("id, user_id, status, role, permission_level, invite_email, joined_at")
    .eq("workspace_id", workspaceId)
    .ilike("invite_email", email)
    .order("joined_at", { ascending: true });
  return (data ?? []) as MemberRow[];
}

async function loadWorkspaceContributorsByEmail(
  service: SupabaseClient,
  workspaceId: string,
  email: string,
): Promise<ContributorRow[]> {
  if (!email) return [];
  const { data } = await service
    .from("contributors")
    .select("id, user_id, name, email, role, created_at")
    .eq("workspace_id", workspaceId)
    .is("project_id", null)
    .ilike("email", email)
    .order("created_at", { ascending: true });
  return (data ?? []) as ContributorRow[];
}

function pickClaimableMember(
  byUserId: MemberRow | null,
  byEmail: MemberRow[],
  userId: string,
): { member: MemberRow | null; alreadyActiveOtherUser: boolean } {
  if (byUserId) return { member: byUserId, alreadyActiveOtherUser: false };

  const pending = byEmail.find((row) => !row.user_id || memberStatus(row) === "pending");
  if (pending) return { member: pending, alreadyActiveOtherUser: false };

  const sameUser = byEmail.find((row) => String(row.user_id ?? "") === userId);
  if (sameUser) return { member: sameUser, alreadyActiveOtherUser: false };

  const otherActive = byEmail.find(
    (row) => memberStatus(row) === "active" && row.user_id && String(row.user_id) !== userId,
  );
  if (otherActive) return { member: otherActive, alreadyActiveOtherUser: true };

  return { member: byEmail[0] ?? null, alreadyActiveOtherUser: false };
}

async function activateMember(
  service: SupabaseClient,
  member: MemberRow,
  input: {
    userId: string;
    email: string | null;
  },
): Promise<string | null> {
  const { error } = await service
    .from("workspace_members")
    .update({
      user_id: input.userId,
      status: "active",
      joined_at: member.joined_at ?? new Date().toISOString(),
      ...(input.email ? { invite_email: input.email } : {}),
    })
    .eq("id", member.id);
  return error?.message ?? null;
}

async function insertMember(
  service: SupabaseClient,
  input: {
    workspaceId: string;
    userId: string;
    email: string | null;
    permissionLevel: WorkspacePermissionLevel;
  },
): Promise<string | null> {
  const { error } = await service.from("workspace_members").insert({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    role: mapWorkspaceMemberRole(input.permissionLevel),
    permission_level: input.permissionLevel,
    status: "active",
    ...(input.email ? { invite_email: input.email } : {}),
    joined_at: new Date().toISOString(),
  });
  return error?.message ?? null;
}

async function deleteExtraPendingMembers(
  service: SupabaseClient,
  members: MemberRow[],
  keepId: string,
): Promise<void> {
  const extraIds = members
    .filter((row) => row.id !== keepId && (!row.user_id || memberStatus(row) === "pending"))
    .map((row) => row.id);
  if (extraIds.length === 0) return;
  await service.from("workspace_members").delete().in("id", extraIds);
}

async function markInvitesAccepted(
  service: SupabaseClient,
  workspaceId: string,
  email: string,
): Promise<void> {
  if (!email) return;
  await service
    .from("workspace_invites")
    .update({ status: "accepted" })
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .ilike("email", email);
}

function pickContributorToClaim(
  contributors: ContributorRow[],
  userId: string,
): ContributorRow | null {
  const linkedToUser = contributors.find((row) => String(row.user_id ?? "") === userId);
  if (linkedToUser) return linkedToUser;
  const pending = contributors.find((row) => !row.user_id);
  if (pending) return pending;
  return contributors[0] ?? null;
}

async function claimContributorProfile(
  service: SupabaseClient,
  input: {
    workspaceId: string;
    userId: string;
    email: string | null;
    displayName?: string | null;
    jobRole?: string | null;
    permissionLevel: WorkspacePermissionLevel;
    invitedName?: string | null;
  },
): Promise<void> {
  const email = input.email;
  const { data: byUser } = await service
    .from("contributors")
    .select("id, user_id, name, email, role")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId)
    .is("project_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const byEmail = email
    ? await loadWorkspaceContributorsByEmail(service, input.workspaceId, email)
    : [];
  const existing =
    (byUser as ContributorRow | null) ?? pickContributorToClaim(byEmail, input.userId);

  if (existing?.user_id && String(existing.user_id) !== input.userId) {
    return;
  }

  const displayName =
    input.displayName?.trim() ||
    input.invitedName?.trim() ||
    String(existing?.name ?? "").trim() ||
    email?.split("@")[0] ||
    "Team member";
  const jobRole =
    input.jobRole?.trim() ||
    String(existing?.role ?? "").trim() ||
    null;
  const roleFields = await resolveContributorRoleFields(service, jobRole);

  if (existing) {
    await service
      .from("contributors")
      .update({
        user_id: input.userId,
        name: displayName,
        email: email ?? existing.email,
        role: roleFields.role ?? existing.role,
        role_id: roleFields.role_id,
        permission_level: input.permissionLevel,
        is_paid: isPaidPermissionLevel(input.permissionLevel),
      })
      .eq("id", existing.id);

    const extras = byEmail.filter((row) => row.id !== existing.id && !row.user_id);
    if (extras.length > 0) {
      await service
        .from("contributors")
        .delete()
        .in(
          "id",
          extras.map((row) => row.id),
        );
    }
    return;
  }

  if (!email && !displayName) return;

  await service.from("contributors").insert({
    workspace_id: input.workspaceId,
    project_id: null,
    user_id: input.userId,
    name: displayName,
    email,
    role: roleFields.role,
    role_id: roleFields.role_id,
    permission_level: input.permissionLevel,
    is_paid: isPaidPermissionLevel(input.permissionLevel),
  });
}

/**
 * Link a signed-in user to an existing pending teammate/invite in a workspace,
 * or create a membership only when no email match exists.
 *
 * Always uses the service role so pending rows (user_id null) are visible.
 */
export async function claimOrCreateWorkspaceMembership(
  input: ClaimWorkspaceMembershipInput,
): Promise<ClaimWorkspaceMembershipResult> {
  const workspaceId = input.workspaceId.trim();
  const userId = input.userId.trim();
  const email = input.email ? normalizeEmail(input.email) : "";
  const fallbackPermissionLevel = input.fallbackPermissionLevel ?? "reviewer";

  if (!workspaceId || !userId) {
    return { ok: false, message: "workspace_id and user_id are required." };
  }

  const service = createServiceClient();
  const workspace = await loadWorkspace(service, workspaceId);
  if (!workspace) {
    return { ok: false, message: "Workspace not found." };
  }

  const pendingInvite = await loadPendingInvite(service, workspaceId, email);
  const inviteExpired =
    Boolean(pendingInvite?.expires_at) &&
    new Date(String(pendingInvite?.expires_at)).getTime() < Date.now();
  const usableInvite = pendingInvite && !inviteExpired ? pendingInvite : null;

  if (pendingInvite && inviteExpired) {
    await service
      .from("workspace_invites")
      .update({ status: "expired" })
      .eq("id", pendingInvite.id);
  }

  const memberByUserId = await loadMemberByUserId(service, workspaceId, userId);
  const membersByEmail = await loadMembersByInviteEmail(service, workspaceId, email);
  const { member, alreadyActiveOtherUser } = pickClaimableMember(
    memberByUserId,
    membersByEmail,
    userId,
  );

  if (alreadyActiveOtherUser) {
    return {
      ok: false,
      message: "This email is already an active member of this workspace.",
    };
  }

  const permissionLevel = usableInvite
    ? mapInvitePermissionLevel(usableInvite.role)
    : member
      ? normalizeWorkspacePermission(member.permission_level)
      : fallbackPermissionLevel;

  const alreadyMember = memberStatus(member) === "active" && String(member?.user_id ?? "") === userId;

  if (member && (memberStatus(member) === "pending" || String(member.user_id ?? "") === userId)) {
    const activateError = await activateMember(service, member, { userId, email: email || null });
    if (activateError) {
      return { ok: false, message: activateError };
    }
    await deleteExtraPendingMembers(service, membersByEmail, member.id);
  } else if (!member) {
    const insertError = await insertMember(service, {
      workspaceId,
      userId,
      email: email || null,
      permissionLevel,
    });
    if (insertError) {
      return { ok: false, message: insertError };
    }
  }

  if (email) {
    await markInvitesAccepted(service, workspaceId, email);
  }

  await claimContributorProfile(service, {
    workspaceId,
    userId,
    email: email || null,
    displayName: input.displayName,
    jobRole: input.jobRole ?? usableInvite?.job_role,
    permissionLevel,
    invitedName: usableInvite?.invited_name,
  });

  return {
    ok: true,
    workspaceId,
    workspaceName: workspace.name,
    permissionLevel,
    alreadyMember,
  };
}

export async function resolveJoinTarget(inviteCode: string): Promise<
  | {
      workspaceId: string;
      personalInvite: boolean;
      inviteEmail: string | null;
      invitedName: string | null;
      jobRole: string | null;
      permissionLevel: WorkspacePermissionLevel;
    }
  | { error: string }
> {
  const code = inviteCode.trim();
  if (!code) return { error: "Invite code is required." };

  const service = createServiceClient();
  const { data: personal } = await service
    .from("workspace_invites")
    .select("id, workspace_id, email, role, status, expires_at, invited_name, job_role")
    .eq("invite_code", code)
    .maybeSingle();

  if (personal) {
    if (personal.status !== "pending") {
      return { error: "Invite is no longer valid." };
    }
    if (new Date(String(personal.expires_at)).getTime() < Date.now()) {
      await service.from("workspace_invites").update({ status: "expired" }).eq("id", personal.id);
      return { error: "Invite has expired." };
    }
    return {
      workspaceId: String(personal.workspace_id),
      personalInvite: true,
      inviteEmail: personal.email ? normalizeEmail(String(personal.email)) : null,
      invitedName:
        typeof personal.invited_name === "string" ? personal.invited_name.trim() : null,
      jobRole: typeof personal.job_role === "string" ? personal.job_role.trim() : null,
      permissionLevel: mapInvitePermissionLevel(personal.role),
    };
  }

  const { data: workspace } = await service
    .from("workspaces")
    .select("id")
    .eq("invite_code", code)
    .maybeSingle();

  if (!workspace?.id) {
    return { error: "Invite not found." };
  }

  return {
    workspaceId: String(workspace.id),
    personalInvite: false,
    inviteEmail: null,
    invitedName: null,
    jobRole: null,
    permissionLevel: "reviewer",
  };
}
