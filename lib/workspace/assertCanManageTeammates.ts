import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWorkspacePermission } from "@/lib/workspace/permissions";

export async function assertCanManageTeammates(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string,
): Promise<{ allowed: boolean; message?: string }> {
  const { data: contributor } = await supabase
    .from("contributors")
    .select("permission_level")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  const level = contributor?.permission_level
    ? normalizeWorkspacePermission(
        (contributor as { permission_level?: string }).permission_level,
      )
    : null;

  if (level === "admin" || level === "editor") {
    return { allowed: true };
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (String((member as { role?: string } | null)?.role ?? "") === "admin") {
    return { allowed: true };
  }

  return {
    allowed: false,
    message: "Only editors and admins can add new teammates.",
  };
}
