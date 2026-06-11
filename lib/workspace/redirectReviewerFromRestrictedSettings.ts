import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { normalizeWorkspacePermission } from "@/lib/workspace/permissions";

/** Reviewers may only access profile settings — block roles, teammates, billing, etc. */
export async function redirectReviewerFromRestrictedSettings() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaceId = getActiveWorkspaceIdFromUser(user);
  if (!workspaceId) {
    return;
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("permission_level, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  const memberRow = member as {
    permission_level?: string | null;
    role?: string | null;
  } | null;

  const fromLevel = memberRow?.permission_level?.trim();
  let permissionLevel = fromLevel;
  if (!permissionLevel && String(memberRow?.role ?? "").trim().toLowerCase() === "admin") {
    permissionLevel = "admin";
  }

  if (normalizeWorkspacePermission(permissionLevel) === "reviewer") {
    redirect("/projects");
  }
}
