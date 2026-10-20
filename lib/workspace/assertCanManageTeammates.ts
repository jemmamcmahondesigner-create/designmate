import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { permissionFromWorkspaceMember } from "@/lib/workspace/parseWorkspaceMember";
import type { WorkspacePermissionLevel } from "@/lib/workspace/permissions";

export type ManageTeammatesAccess =
  | { allowed: true; permissionLevel: WorkspacePermissionLevel }
  | { allowed: false; message: string };

/**
 * Editor-or-Admin gate for teammate invite/cancel.
 * Reads workspace_members for the session user (active only), not contributors or user_metadata.
 */
export async function assertCanManageTeammates(
  _supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<ManageTeammatesAccess> {
  const service = createServiceClient();
  const { data: member } = await service
    .from("workspace_members")
    .select("permission_level, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!member) {
    return {
      allowed: false,
      message: "Only editors and admins can add new teammates.",
    };
  }

  const permissionLevel = permissionFromWorkspaceMember(member);
  if (permissionLevel === "admin" || permissionLevel === "editor") {
    return { allowed: true, permissionLevel };
  }

  return {
    allowed: false,
    message: "Only editors and admins can add new teammates.",
  };
}
