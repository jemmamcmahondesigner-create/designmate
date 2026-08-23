import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { claimOrCreateWorkspaceMembership } from "@/lib/workspace/claimWorkspaceMembership";
import { normalizeInviteEmail } from "@/lib/workspace/invite-server";

export async function POST(request: Request) {
  let body: { invite_code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const inviteCode = body.invite_code?.trim();
  if (!inviteCode) {
    return NextResponse.json({ message: "invite_code is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: invite, error: inviteError } = await service
    .from("workspace_invites")
    .select("id, workspace_id, role, status, expires_at, email, job_role, invited_name")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (inviteError || !invite) {
    return NextResponse.json({ message: "Invite not found." }, { status: 404 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ message: "Invite is no longer valid." }, { status: 404 });
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await service.from("workspace_invites").update({ status: "expired" }).eq("id", invite.id);
    return NextResponse.json({ message: "Invite has expired." }, { status: 404 });
  }

  const inviteEmail = normalizeInviteEmail(String(invite.email ?? user.email ?? ""));
  const displayName =
    (typeof invite.invited_name === "string" ? invite.invited_name.trim() : "") ||
    (user.user_metadata?.display_name as string | undefined)?.trim() ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    inviteEmail ||
    "Team member";

  const result = await claimOrCreateWorkspaceMembership({
    workspaceId: invite.workspace_id,
    userId: user.id,
    email: inviteEmail || user.email || null,
    displayName,
    jobRole:
      (typeof invite.job_role === "string" ? invite.job_role.trim() : "") ||
      (user.user_metadata?.role as string | undefined)?.trim() ||
      null,
  });

  if (!result.ok) {
    const status = result.message.includes("already an active member") ? 409 : 400;
    return NextResponse.json({ message: result.message }, { status });
  }

  const { error: metadataError } = await service.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      active_workspace_id: result.workspaceId,
      workspace_id: result.workspaceId,
      onboarding_complete: true,
    },
  });

  if (metadataError) {
    return NextResponse.json({ message: metadataError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, workspace_id: result.workspaceId });
}
