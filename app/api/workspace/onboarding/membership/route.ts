import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeInviteEmail } from "@/lib/workspace/invite-server";
import { normalizeWorkspacePermission } from "@/lib/workspace/permissions";

function pickWorkspaceName(workspaces: unknown): string | null {
  const rel = workspaces as
    | { name?: string | null }
    | { name?: string | null }[]
    | null
    | undefined;
  const row = Array.isArray(rel) ? rel[0] : rel;
  const name = String(row?.name ?? "").trim();
  return name || null;
}

type MemberHit = {
  workspace_id: string;
  user_id: string | null;
  status: string | null;
  permission_level: string | null;
  joined_at: string | null;
  workspaces?: unknown;
};

function toPayload(row: MemberHit, userId: string) {
  const status = String(row.status ?? "").trim().toLowerCase();
  const linked = String(row.user_id ?? "").trim() === userId;
  return {
    member: true as const,
    workspace_id: row.workspace_id,
    workspace_name: pickWorkspaceName(row.workspaces),
    permission_level: normalizeWorkspacePermission(row.permission_level),
    needs_claim: !(status === "active" && linked),
  };
}

function pickPreferred(rows: MemberHit[], preferredWorkspaceId: string | null): MemberHit | null {
  if (rows.length === 0) return null;
  if (preferredWorkspaceId) {
    const match = rows.find((row) => row.workspace_id === preferredWorkspaceId);
    if (match) return match;
  }
  return rows[0] ?? null;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ member: false }, { status: 401 });
  }

  const service = createServiceClient();
  const preferredWorkspaceId = String(
    user.user_metadata?.active_workspace_id ?? "",
  ).trim() || null;

  const { data: byUser } = await service
    .from("workspace_members")
    .select("workspace_id, user_id, status, permission_level, joined_at, workspaces(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  const userHit = pickPreferred((byUser ?? []) as MemberHit[], preferredWorkspaceId);
  if (userHit) {
    return NextResponse.json(toPayload(userHit, user.id));
  }

  const email = normalizeInviteEmail(user.email ?? "");
  if (!email) {
    return NextResponse.json({ member: false });
  }

  const { data: byEmail } = await service
    .from("workspace_members")
    .select("workspace_id, user_id, status, permission_level, joined_at, workspaces(name)")
    .ilike("invite_email", email)
    .order("joined_at", { ascending: true });

  const emailRows = [...((byEmail ?? []) as MemberHit[])].sort((a, b) => {
    const aActive = String(a.status ?? "").toLowerCase() === "active" ? 0 : 1;
    const bActive = String(b.status ?? "").toLowerCase() === "active" ? 0 : 1;
    return aActive - bActive;
  });

  const emailHit = pickPreferred(emailRows, preferredWorkspaceId);
  if (!emailHit) {
    return NextResponse.json({ member: false });
  }

  return NextResponse.json(toPayload(emailHit, user.id));
}
