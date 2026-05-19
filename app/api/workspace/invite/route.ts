import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWorkspaceInvite } from "@/lib/workspace/invite-server";
import type { InviteApiResponse } from "@/types/invites";

export async function POST(request: Request) {
  let body: {
    workspace_id?: string;
    email?: string;
    name?: string;
    role?: string;
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

  const { data: adminMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!adminMember) {
    return NextResponse.json(
      { status: "error", message: "Only workspace admins can send invites." },
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
    invitedByUserId: user.id,
    inviterName,
  });

  const status = result.status === "error" ? 400 : 200;
  return NextResponse.json(result, { status });
}
