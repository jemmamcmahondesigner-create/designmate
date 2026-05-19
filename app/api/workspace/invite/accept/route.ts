import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { mapInviteRole } from "@/lib/workspace/invite-server";

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
    .select("id, workspace_id, role, status, expires_at, email")
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

  const { data: existingMember } = await service
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", invite.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existingMember) {
    const { error: memberError } = await service.from("workspace_members").insert({
      workspace_id: invite.workspace_id,
      user_id: user.id,
      role: mapInviteRole(invite.role),
      status: "active",
      invite_email: invite.email,
    });

    if (memberError) {
      return NextResponse.json({ message: memberError.message }, { status: 400 });
    }
  }

  await service.from("workspace_invites").update({ status: "accepted" }).eq("id", invite.id);

  const { error: metadataError } = await service.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      active_workspace_id: invite.workspace_id,
      workspace_id: invite.workspace_id,
      onboarding_complete: true,
    },
  });

  if (metadataError) {
    return NextResponse.json({ message: metadataError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, workspace_id: invite.workspace_id });
}
