import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { normalizeInviteEmail } from "@/lib/workspace/invite-server";
import { mapInvitePermissionLevel } from "@/lib/workspace/permissions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const inviteCode = searchParams.get("invite_code")?.trim();

  if (!inviteCode) {
    return NextResponse.json({ message: "invite_code is required." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: invite, error } = await service
    .from("workspace_invites")
    .select(
      "workspace_id, email, role, status, expires_at, invited_by, invited_name, job_role, workspaces(name)",
    )
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (error || !invite) {
    return NextResponse.json({ message: "Invite not found." }, { status: 404 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ message: "Invite is no longer valid." }, { status: 404 });
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await service
      .from("workspace_invites")
      .update({ status: "expired" })
      .eq("invite_code", inviteCode);
    return NextResponse.json({ message: "Invite has expired." }, { status: 404 });
  }

  const workspaceJoin = invite.workspaces as { name?: string } | null;
  let inviterName = "Your team";

  if (invite.invited_by) {
    const { data: inviter } = await service.auth.admin.getUserById(String(invite.invited_by));
    inviterName =
      (inviter.user?.user_metadata?.display_name as string | undefined)?.trim() ||
      inviter.user?.email?.split("@")[0] ||
      inviterName;
  }

  const normalizedEmail = normalizeInviteEmail(String(invite.email ?? ""));
  let invitedName =
    typeof invite.invited_name === "string" ? invite.invited_name.trim() : "";
  let jobRole = typeof invite.job_role === "string" ? invite.job_role.trim() : "";

  if (!invitedName || !jobRole) {
    const { data: contributor } = await service
      .from("contributors")
      .select("name, role")
      .eq("workspace_id", invite.workspace_id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (contributor) {
      if (!invitedName && contributor.name) {
        invitedName = String(contributor.name).trim();
      }
      if (!jobRole && contributor.role) {
        jobRole = String(contributor.role).trim();
      }
    }
  }

  const permissionLevel = mapInvitePermissionLevel(invite.role);

  return NextResponse.json({
    workspace_name: String(workspaceJoin?.name ?? "Workspace"),
    inviter_name: inviterName,
    role: permissionLevel,
    expires_at: String(invite.expires_at),
    email: normalizedEmail,
    invited_name: invitedName || null,
    job_role: jobRole || null,
  });
}
