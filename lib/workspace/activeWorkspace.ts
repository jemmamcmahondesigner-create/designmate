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
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return getActiveWorkspaceIdFromUser(user);
  } catch (err) {
    // Auth lock contention — return null gracefully
    // The caller should handle null workspace ID
    console.warn("[getActiveWorkspaceId] auth lock error:", err);
    return null;
  }
}
