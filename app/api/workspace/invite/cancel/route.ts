import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { assertCanManageTeammates } from "@/lib/workspace/assertCanManageTeammates";

export async function PATCH(request: Request) {
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
  const { data: invite, error: fetchError } = await service
    .from("workspace_invites")
    .select("id, workspace_id, status")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (fetchError || !invite) {
    return NextResponse.json({ message: "Invite not found." }, { status: 404 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ message: "Invite is no longer pending." }, { status: 400 });
  }

  const access = await assertCanManageTeammates(supabase, user.id, invite.workspace_id);
  if (!access.allowed) {
    return NextResponse.json(
      { message: access.message ?? "Forbidden." },
      { status: 403 },
    );
  }

  const { error: updateError } = await service
    .from("workspace_invites")
    .update({ status: "expired" })
    .eq("invite_code", inviteCode);

  if (updateError) {
    return NextResponse.json({ message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
