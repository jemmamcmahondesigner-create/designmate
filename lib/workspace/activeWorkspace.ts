import type { SupabaseClient, User } from "@supabase/supabase-js";

/*
 * STEP 0 — active workspace resolution:
 * - active_workspace_id: kept current on workspace switch/create/join
 * - workspace_id: set at onboarding; may become stale after multiple workspaces
 */
export function getActiveWorkspaceIdFromUser(
  user: User | null | undefined,
): string | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const activeId = meta.active_workspace_id;
  if (typeof activeId === "string" && activeId.trim()) {
    return activeId.trim();
  }
  const legacyId = meta.workspace_id;
  if (typeof legacyId === "string" && legacyId.trim()) {
    return legacyId.trim();
  }
  return null;
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
