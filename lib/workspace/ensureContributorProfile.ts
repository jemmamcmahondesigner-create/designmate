import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPaidPermissionLevel,
  type WorkspacePermissionLevel,
} from "@/lib/workspace/permissions";
import { resolveContributorRoleFields } from "@/lib/workspace/resolveContributorRoleFields";

type EnsureContributorProfileInput = {
  userId: string;
  email: string | null;
  displayName: string;
  role: string | null;
  activeWorkspaceId: string | null;
  permissionLevel?: WorkspacePermissionLevel;
};

export async function ensureContributorProfile(
  supabase: SupabaseClient,
  input: EnsureContributorProfileInput,
): Promise<{ error: string | null }> {
  const {
    userId,
    email,
    displayName,
    role,
    activeWorkspaceId,
    permissionLevel = "admin",
  } = input;
  if (!activeWorkspaceId || !displayName.trim()) {
    return { error: null };
  }

  const name = displayName.trim();
  const emailValue = email?.trim() || null;
  const isPaid = isPaidPermissionLevel(permissionLevel);
  const roleFields = await resolveContributorRoleFields(supabase, role);

  const contributorUpdates = {
    user_id: userId,
    name,
    email: emailValue,
    role: roleFields.role,
    role_id: roleFields.role_id,
    permission_level: permissionLevel,
    is_paid: isPaid,
  };

  const { data: workspaceProfiles } = await supabase
    .from("contributors")
    .select("id")
    .eq("workspace_id", activeWorkspaceId)
    .eq("user_id", userId)
    .is("project_id", null)
    .order("created_at", { ascending: true })
    .limit(1);

  const workspaceProfileId = String(
    (workspaceProfiles?.[0] as { id?: string } | null)?.id ?? "",
  ).trim();

  if (workspaceProfileId) {
    const { error } = await supabase
      .from("contributors")
      .update(contributorUpdates)
      .eq("id", workspaceProfileId);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("contributors").insert({
    workspace_id: activeWorkspaceId,
    project_id: null as string | null,
    ...contributorUpdates,
  });
  return { error: error?.message ?? null };
}
