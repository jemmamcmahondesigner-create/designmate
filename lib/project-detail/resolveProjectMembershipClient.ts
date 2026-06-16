import type { SupabaseClient } from "@supabase/supabase-js";
import { readDevImpersonationContributorIdFromBrowser } from "@/lib/auth/resolveEffectiveContributor";
import {
  normalizeWorkspacePermission,
  type WorkspacePermissionLevel,
} from "@/lib/workspace/permissions";

/** True when the viewer has a contributor row with project_id = this project. */
export async function resolveHasProjectContributorRowClient(
  supabase: SupabaseClient,
  projectId: string,
  workspaceUserId: string | null,
): Promise<boolean> {
  const impersonatedContributorId =
    readDevImpersonationContributorIdFromBrowser();

  if (impersonatedContributorId) {
    const { data } = await supabase
      .from("contributors")
      .select("id")
      .eq("id", impersonatedContributorId)
      .eq("project_id", projectId)
      .maybeSingle();
    return Boolean(data);
  }

  if (workspaceUserId) {
    const { data } = await supabase
      .from("contributors")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", workspaceUserId)
      .maybeSingle();
    return Boolean(data);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;

  const { data } = await supabase
    .from("contributors")
    .select("id")
    .eq("project_id", projectId)
    .ilike("email", email)
    .maybeSingle();

  return Boolean(data);
}

/** @deprecated Use resolveHasProjectContributorRowClient */
export const resolveIsProjectMemberClient = resolveHasProjectContributorRowClient;

/** Editors and admins have workspace-level access; reviewers need a project contributor row. */
export function deriveIsProjectMember(
  workspacePermissionLevel: WorkspacePermissionLevel | null,
  hasProjectContributorRow: boolean | null,
  workspacePermissionLoading = false,
): boolean | null {
  if (workspacePermissionLoading) return null;

  const permission = normalizeWorkspacePermission(workspacePermissionLevel);
  if (permission === "editor" || permission === "admin") return true;

  if (hasProjectContributorRow === null) return null;
  return hasProjectContributorRow;
}
