import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspacePermissionLevel } from "@/lib/workspace/permissions";

export type WorkspaceMemberUpsertInput = {
  workspace_id: string;
  user_id: string;
  role: "admin" | "member";
  permission_level: WorkspacePermissionLevel | string;
  status?: "pending" | "active";
  invite_email?: string | null;
  joined_at?: string;
};

/**
 * Idempotent workspace membership write — safe for create/join retries.
 * On conflict (user_id, workspace_id), updates role/permission/status/joined_at.
 */
export async function ensureWorkspaceMember(
  supabase: SupabaseClient,
  input: WorkspaceMemberUpsertInput,
): Promise<{ error: string | null }> {
  const workspaceId = input.workspace_id.trim();
  const userId = input.user_id.trim();
  if (!workspaceId || !userId) {
    return { error: "workspace_id and user_id are required." };
  }

  const inviteEmail = input.invite_email?.trim().toLowerCase() || "";
  if (inviteEmail) {
    const { data: pendingByEmail } = await supabase
      .from("workspace_members")
      .select("id, user_id, status")
      .eq("workspace_id", workspaceId)
      .ilike("invite_email", inviteEmail)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const pendingUserId = String(
      (pendingByEmail as { user_id?: string | null } | null)?.user_id ?? "",
    ).trim();
    const pendingStatus = String(
      (pendingByEmail as { status?: string | null } | null)?.status ?? "",
    ).trim().toLowerCase();

    if (pendingByEmail?.id && (!pendingUserId || pendingUserId === userId || pendingStatus === "pending")) {
      const { error } = await supabase
        .from("workspace_members")
        .update({
          user_id: userId,
          status: input.status ?? "active",
          invite_email: inviteEmail,
          joined_at: input.joined_at ?? new Date().toISOString(),
        })
        .eq("id", pendingByEmail.id);
      return { error: error?.message ?? null };
    }
  }

  const { error } = await supabase.from("workspace_members").upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      role: input.role,
      permission_level: input.permission_level,
      status: input.status ?? "active",
      ...(input.invite_email != null && input.invite_email !== ""
        ? { invite_email: input.invite_email }
        : {}),
      joined_at: input.joined_at ?? new Date().toISOString(),
    },
    { onConflict: "user_id,workspace_id" },
  );

  return { error: error?.message ?? null };
}
