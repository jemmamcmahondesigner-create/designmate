import { createServiceClient } from "@/lib/supabase/admin";
import { DESIGN_TRACE_RESEND_FROM, getInviteEmailHtml } from "@/lib/emails/invite-email";
import {
  isPaidPermissionLevel,
  mapInvitePermissionLevel,
  mapWorkspaceMemberRole,
} from "@/lib/workspace/permissions";
import { resolveContributorRoleFields } from "@/lib/workspace/resolveContributorRoleFields";
import { ensureWorkspaceMember } from "@/lib/workspace/ensureWorkspaceMember";
import { ensurePendingInviteContributor } from "@/lib/workspace/teammates";
import type { InviteApiResponse } from "@/types/invites";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** @deprecated Use mapInvitePermissionLevel + mapWorkspaceMemberRole */
export function mapInviteRole(role?: string | null): string {
  return mapWorkspaceMemberRole(mapInvitePermissionLevel(role));
}

export function getAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function findAuthUserByEmail(email: string) {
  const supabase = createServiceClient();
  const normalized = normalizeInviteEmail(email);
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => (user.email ?? "").toLowerCase() === normalized);
    if (match) return match;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

export async function sendInviteEmail({
  to,
  inviterName,
  workspaceName,
  inviteCode,
}: {
  to: string;
  inviterName: string;
  workspaceName: string;
  inviteCode: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[invite] RESEND_API_KEY is not set; skipping email send.");
    return;
  }

  const from = process.env.RESEND_FROM?.trim() || DESIGN_TRACE_RESEND_FROM;
  const inviteUrl = `${getAppOrigin()}/auth/new-account?invite_code=${encodeURIComponent(inviteCode)}&email=${encodeURIComponent(to)}`;
  const subject = `${inviterName} invited you to join ${workspaceName} on DesignTrace`;
  const html = getInviteEmailHtml({ inviterName, workspaceName, inviteUrl });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error: ${response.status} ${body}`);
  }
}

export async function createWorkspaceInvite({
  workspaceId,
  email,
  name,
  role,
  permissionLevel: permissionLevelInput,
  invitedByUserId,
  inviterName,
}: {
  workspaceId: string;
  email: string;
  name?: string;
  role?: string;
  permissionLevel?: string;
  invitedByUserId: string;
  inviterName: string;
}): Promise<InviteApiResponse> {
  const service = createServiceClient();
  const normalizedEmail = normalizeInviteEmail(email);
  const permissionLevel = mapInvitePermissionLevel(permissionLevelInput ?? role);
  const memberRole = mapWorkspaceMemberRole(permissionLevel);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { data: workspace } = await service
    .from("workspaces")
    .select("id, name")
    .eq("id", workspaceId)
    .maybeSingle();

  if (!workspace) {
    return { status: "error", message: "Workspace not found." };
  }

  const existingUser = await findAuthUserByEmail(normalizedEmail);
  if (existingUser) {
    const { data: existingMember } = await service
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", existingUser.id)
      .limit(1)
      .maybeSingle();

    if (existingMember) {
      return { status: "already_member" };
    }

    const { error: memberError } = await ensureWorkspaceMember(service, {
      workspace_id: workspaceId,
      user_id: existingUser.id,
      role: memberRole,
      permission_level: permissionLevel,
      status: "active",
      invite_email: normalizedEmail,
    });

    if (memberError) {
      return { status: "error", message: memberError };
    }

    const displayName =
      name?.trim() ||
      (existingUser.user_metadata?.display_name as string | undefined)?.trim() ||
      (existingUser.user_metadata?.full_name as string | undefined)?.trim() ||
      existingUser.email?.split("@")[0] ||
      "Team member";

    const { data: existingProfiles } = await service
      .from("contributors")
      .select("id")
      .eq("user_id", existingUser.id)
      .eq("workspace_id", workspaceId)
      .is("project_id", null)
      .order("created_at", { ascending: true })
      .limit(1);

    if (!existingProfiles?.[0]) {
      const jobRole = role?.trim() || "Reviewer";
      const roleFields = await resolveContributorRoleFields(service, jobRole);

      await service.from("contributors").insert({
        name: displayName,
        email: normalizedEmail,
        role: roleFields.role,
        role_id: roleFields.role_id,
        permission_level: permissionLevel,
        is_paid: isPaidPermissionLevel(permissionLevel),
        project_id: null,
        workspace_id: workspaceId,
        user_id: existingUser.id,
      });
    }

    return { status: "added", user_id: existingUser.id };
  }

  const inviteCode = crypto.randomUUID().replace(/-/g, "").slice(0, 32);

  const invitedName = name?.trim() || null;
  const jobRole = role?.trim() || null;

  const inviteRow: Record<string, unknown> = {
    workspace_id: workspaceId,
    email: normalizedEmail,
    role: permissionLevel,
    invited_by: invitedByUserId,
    invite_code: inviteCode,
    status: "pending",
    expires_at: expiresAt,
  };
  if (invitedName) inviteRow.invited_name = invitedName;
  if (jobRole) inviteRow.job_role = jobRole;

  const { data: invite, error: inviteError } = await service
    .from("workspace_invites")
    .upsert(inviteRow, { onConflict: "workspace_id,email" })
    .select("invite_code, email")
    .single();

  if (inviteError || !invite) {
    return { status: "error", message: inviteError?.message ?? "Could not create invite." };
  }

  await ensurePendingInviteContributor(service, workspaceId, {
    email: normalizedEmail,
    invited_name: invitedName,
    job_role: jobRole,
    role: permissionLevel,
  });

  try {
    await sendInviteEmail({
      to: normalizedEmail,
      inviterName,
      workspaceName: String(workspace.name ?? "your team"),
      inviteCode: String(invite.invite_code),
    });
  } catch (err) {
    console.error("[invite] email send failed:", err);
    return { status: "error", message: "Invite created but email could not be sent." };
  }

  return { status: "invited" };
}
