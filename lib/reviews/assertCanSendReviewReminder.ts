import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveCurrentContributor } from "@/lib/auth/effectiveContributor";

export async function assertCanSendReviewReminder(
  adminSupabase: SupabaseClient,
  reviewId: string,
  projectId: string,
  sessionSupabase: SupabaseClient,
): Promise<{ allowed: true; contributorId: string } | { allowed: false }> {
  const contributor = await getEffectiveCurrentContributor(sessionSupabase, projectId);
  if (!contributor?.id) {
    return { allowed: false };
  }

  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();
  const authUserId = user?.id?.trim() ?? "";

  const perm = String(contributor.permissionLevel ?? "")
    .trim()
    .toLowerCase();
  if (perm === "editor" || perm === "admin") {
    return { allowed: true, contributorId: contributor.id };
  }

  if (authUserId) {
    const { data: projectRow } = await adminSupabase
      .from("projects")
      .select("workspace_id")
      .eq("id", projectId)
      .maybeSingle();
    const workspaceId = String(
      (projectRow as { workspace_id?: string | null } | null)?.workspace_id ?? "",
    ).trim();
    if (workspaceId) {
      const { data: member } = await adminSupabase
        .from("workspace_members")
        .select("permission_level, role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", authUserId)
        .maybeSingle();
      const memberRow = member as {
        permission_level?: string | null;
        role?: string | null;
      } | null;
      const workspacePerm = String(memberRow?.permission_level ?? "")
        .trim()
        .toLowerCase();
      if (
        workspacePerm === "editor" ||
        workspacePerm === "admin" ||
        String(memberRow?.role ?? "").trim().toLowerCase() === "admin"
      ) {
        return { allowed: true, contributorId: contributor.id };
      }
    }
  }

  const { data: review } = await adminSupabase
    .from("reviews")
    .select("owner_display_name, creator_id")
    .eq("id", reviewId)
    .maybeSingle();

  const reviewRow = review as {
    owner_display_name?: string | null;
    creator_id?: string | null;
  } | null;
  const creatorAuthUserId = String(reviewRow?.creator_id ?? "").trim();
  if (creatorAuthUserId && authUserId && creatorAuthUserId === authUserId) {
    return { allowed: true, contributorId: contributor.id };
  }

  const ownerName = String(reviewRow?.owner_display_name ?? "")
    .trim()
    .toLowerCase();
  const contributorName = contributor.name.trim().toLowerCase();
  if (ownerName && contributorName && ownerName === contributorName) {
    return { allowed: true, contributorId: contributor.id };
  }

  const { data: createdEvent } = await adminSupabase
    .from("timeline_events")
    .select("actor_id")
    .eq("review_id", reviewId)
    .eq("event_type", "review_created")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const creatorId = String(
    (createdEvent as { actor_id?: string | null } | null)?.actor_id ?? "",
  ).trim();
  if (creatorId && creatorId === contributor.id) {
    return { allowed: true, contributorId: contributor.id };
  }

  return { allowed: false };
}
