import type { SupabaseClient, User } from "@supabase/supabase-js";

export function getActiveWorkspaceIdFromUser(
  user: User | null | undefined,
): string | null {
  const id = user?.user_metadata?.active_workspace_id;
  if (typeof id !== "string" || !id.trim()) return null;
  return id.trim();
}

export async function getActiveWorkspaceId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return getActiveWorkspaceIdFromUser(user);
}
