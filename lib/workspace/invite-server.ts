import { createServiceClient } from "@/lib/supabase/admin";
import { DESIGN_TRACE_RESEND_FROM, getInviteEmailHtml } from "@/lib/emails/invite-email";
import type { InviteApiResponse } from "@/types/invites";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function mapInviteRole(role?: string | null): string {
  const value = String(role ?? "member").trim().toLowerCase();
  if (value === "admin") return "admin";
  if (value === "viewer" || value === "reviewer") return "member";
  return "member";
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
  invitedByUserId,
  inviterName,
}: {
  workspaceId: string;
  email: string;
  name?: string;
  role?: string;
  invitedByUserId: string;
  inviterName: string;
}): Promise<InviteApiResponse> {
  const service = createServiceClient();
  const normalizedEmail = normalizeInviteEmail(email);
  const memberRole = mapInviteRole(role);
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
      .maybeSingle();

    if (existingMember) {
      return { status: "already_member" };
    }

    const { error: memberError } = await service.from("workspace_members").insert({
      workspace_id: workspaceId,
      user_id: existingUser.id,
      role: memberRole,
      status: "active",
      invite_email: normalizedEmail,
    });

    if (memberError) {
      return { status: "error", message: memberError.message };
    }

    return { status: "added", user_id: existingUser.id };
  }

  const inviteCode = crypto.randomUUID().replace(/-/g, "").slice(0, 32);

  const { data: invite, error: inviteError } = await service
    .from("workspace_invites")
    .upsert(
      {
        workspace_id: workspaceId,
        email: normalizedEmail,
        role: memberRole,
        invited_by: invitedByUserId,
        invite_code: inviteCode,
        status: "pending",
        expires_at: expiresAt,
      },
      { onConflict: "workspace_id,email" },
    )
    .select("invite_code, email")
    .single();

  if (inviteError || !invite) {
    return { status: "error", message: inviteError?.message ?? "Could not create invite." };
  }

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

  void name;
  return { status: "invited" };
}
