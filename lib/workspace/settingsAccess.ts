import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import {
  normalizeWorkspacePermission,
  type WorkspacePermissionLevel,
} from "@/lib/workspace/permissions";

async function resolveCurrentWorkspacePermissionLevel(): Promise<WorkspacePermissionLevel | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const workspaceId = getActiveWorkspaceIdFromUser(user);
  if (!workspaceId) {
    return null;
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

  return normalizeWorkspacePermission(permissionLevel);
}

export async function getWorkspacePermissionLevelForCurrentUser(): Promise<WorkspacePermissionLevel | null> {
  return resolveCurrentWorkspacePermissionLevel();
}

/** Reviewers cannot access the teammates roster — redirect direct URL visits. */
export async function redirectReviewerFromTeammatesSettings() {
  const level = await resolveCurrentWorkspacePermissionLevel();
  if (level === "reviewer") {
    redirect("/projects");
  }
}
