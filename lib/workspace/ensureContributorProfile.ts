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
): Promise<void> {
  const {
    userId,
    email,
    displayName,
    role,
    activeWorkspaceId,
    permissionLevel = "admin",
  } = input;
  if (!activeWorkspaceId || !displayName.trim()) return;

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

  const matchingIds = new Set<string>();

  const { data: byUserId } = await supabase
    .from("contributors")
    .select("id")
    .eq("workspace_id", activeWorkspaceId)
    .eq("user_id", userId);

  for (const row of byUserId ?? []) {
    const id = String((row as { id?: string }).id ?? "").trim();
    if (id) matchingIds.add(id);
  }

  if (emailValue) {
    const { data: byEmail } = await supabase
      .from("contributors")
      .select("id")
      .eq("workspace_id", activeWorkspaceId)
      .ilike("email", emailValue);

    for (const row of byEmail ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      if (id) matchingIds.add(id);
    }
  }

  if (matchingIds.size > 0) {
    await supabase
      .from("contributors")
      .update(contributorUpdates)
      .in("id", [...matchingIds]);
    return;
  }

  await supabase.from("contributors").insert({
    workspace_id: activeWorkspaceId,
    project_id: null as string | null,
    ...contributorUpdates,
  });
}
