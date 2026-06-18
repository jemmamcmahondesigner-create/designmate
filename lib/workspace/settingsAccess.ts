import "server-only";

import { redirect } from "next/navigation";
import {
  getWorkspaceMembershipForCurrentUser,
} from "@/lib/workspace/resolveWorkspaceMembership";
import type { WorkspacePermissionLevel } from "@/lib/workspace/permissions";

export async function getWorkspacePermissionLevelForCurrentUser(): Promise<WorkspacePermissionLevel | null> {
  const membership = await getWorkspaceMembershipForCurrentUser();
  return membership.workspacePermissionLevel;
}

/** Reviewers cannot access the teammates roster — redirect direct URL visits. */
export async function redirectReviewerFromTeammatesSettings() {
  const level = await getWorkspacePermissionLevelForCurrentUser();
  if (level === "reviewer") {
    redirect("/projects");
  }
}
