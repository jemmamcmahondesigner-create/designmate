import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWorkspaceInvite } from "@/lib/workspace/invite-server";
import { assertCanManageTeammates } from "@/lib/workspace/assertCanManageTeammates";
import type { InviteApiResponse } from "@/types/invites";
import type { WorkspacePermissionLevel } from "@/lib/workspace/permissions";

const INVITE_PERMISSION_LEVELS = new Set<WorkspacePermissionLevel>([
  "reviewer",
  "editor",
  "admin",
]);

function parseInvitePermissionLevel(
  value: unknown,
): { ok: true; value: WorkspacePermissionLevel } | { ok: false } {
  if (value == null || String(value).trim() === "") {
    return { ok: true, value: "reviewer" };
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "reviewer" || normalized === "editor" || normalized === "admin") {
    return { ok: true, value: normalized };
  }
  return { ok: false };
}

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

  const parsedPermission = parseInvitePermissionLevel(body.permission_level);
  if (!parsedPermission.ok) {
    return NextResponse.json(
      {
        status: "error",
        message: "permission_level must be reviewer, editor, or admin.",
      },
      { status: 400 },
    );
  }
  const permissionLevel = parsedPermission.value;
  if (!INVITE_PERMISSION_LEVELS.has(permissionLevel)) {
    return NextResponse.json(
      {
        status: "error",
        message: "permission_level must be reviewer, editor, or admin.",
      },
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

  if (permissionLevel === "admin" && access.permissionLevel !== "admin") {
    return NextResponse.json(
      {
        status: "error",
        message: "Only workspace admins can invite teammates as Admin.",
      },
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
    permissionLevel,
    invitedByUserId: user.id,
    inviterName,
  });

  const status = result.status === "error" ? 400 : 200;
  return NextResponse.json(result, { status });
}
