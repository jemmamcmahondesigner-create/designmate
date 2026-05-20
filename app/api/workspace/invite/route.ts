import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWorkspaceInvite } from "@/lib/workspace/invite-server";
import { assertCanManageTeammates } from "@/lib/workspace/assertCanManageTeammates";
import type { InviteApiResponse } from "@/types/invites";

export async function POST(request: Request) {
  let body: {
    workspace_id?: string;
    email?: string;
    name?: string;
    role?: string;
    permission_level?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON body." }, { status: 400 });
  }

  const workspaceId = body.workspace_id?.trim();
  const email = body.email?.trim();

  if (!workspaceId || !email) {
    return NextResponse.json(
      { status: "error", message: "workspace_id and email are required." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Unauthorized." }, { status: 401 });
  }

  const access = await assertCanManageTeammates(supabase, user.id, workspaceId);
  if (!access.allowed) {
    return NextResponse.json(
      { status: "error", message: access.message ?? "Forbidden." },
      { status: 403 },
    );
  }

  const inviterName =
    (user.user_metadata?.display_name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "A teammate";

  const result: InviteApiResponse = await createWorkspaceInvite({
    workspaceId,
    email,
    name: body.name,
    role: body.role,
    permissionLevel: body.permission_level,
    invitedByUserId: user.id,
    inviterName,
  });

  const status = result.status === "error" ? 400 : 200;
  return NextResponse.json(result, { status });
}
