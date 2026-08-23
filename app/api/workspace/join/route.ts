import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  claimOrCreateWorkspaceMembership,
  resolveJoinTarget,
} from "@/lib/workspace/claimWorkspaceMembership";

export async function POST(request: Request) {
  let body: { invite_code?: string; workspace_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const inviteCode = body.invite_code?.trim();
  let workspaceId = body.workspace_id?.trim() || "";
  let fallbackPermissionLevel: "admin" | "editor" | "reviewer" = "reviewer";
  let inviteEmail = user.email ?? null;
  let invitedName: string | null = null;
  let jobRole: string | null = null;

  if (inviteCode) {
    const target = await resolveJoinTarget(inviteCode);
    if ("error" in target) {
      return NextResponse.json({ message: target.error }, { status: 404 });
    }
    workspaceId = target.workspaceId;
    fallbackPermissionLevel = target.permissionLevel;
    invitedName = target.invitedName;
    jobRole = target.jobRole;
    if (target.inviteEmail) {
      inviteEmail = target.inviteEmail;
    }
  }

  if (!workspaceId) {
    return NextResponse.json(
      { message: "invite_code or workspace_id is required." },
      { status: 400 },
    );
  }

  const result = await claimOrCreateWorkspaceMembership({
    workspaceId,
    userId: user.id,
    email: inviteEmail,
    displayName:
      (user.user_metadata?.display_name as string | undefined)?.trim() ||
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      invitedName,
    jobRole: jobRole || (user.user_metadata?.role as string | undefined)?.trim() || null,
    fallbackPermissionLevel,
  });

  if (!result.ok) {
    const status = result.message.includes("already an active member") ? 409 : 400;
    return NextResponse.json({ message: result.message }, { status });
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      active_workspace_id: result.workspaceId,
      workspace_id: result.workspaceId,
    },
  });

  if (metadataError) {
    return NextResponse.json({ message: metadataError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    workspace_id: result.workspaceId,
    workspace_name: result.workspaceName,
    permission_level: result.permissionLevel,
    already_member: result.alreadyMember,
  });
}
