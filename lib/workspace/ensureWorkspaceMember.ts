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
