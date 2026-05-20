import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveCurrentContributor } from "@/lib/auth/effectiveContributor";

export async function assertCanSendReviewReminder(
  supabase: SupabaseClient,
  reviewId: string,
  projectId: string,
): Promise<{ allowed: true; contributorId: string } | { allowed: false }> {
  const contributor = await getEffectiveCurrentContributor(supabase, projectId);
  if (!contributor?.id) {
    return { allowed: false };
  }

  const perm = String(contributor.permissionLevel ?? "")
    .trim()
    .toLowerCase();
  if (perm === "editor" || perm === "admin") {
    return { allowed: true, contributorId: contributor.id };
  }

  const { data: review } = await supabase
    .from("reviews")
    .select("owner_display_name")
    .eq("id", reviewId)
    .maybeSingle();

  const ownerName = String(
    (review as { owner_display_name?: string | null } | null)?.owner_display_name ?? "",
  )
    .trim()
    .toLowerCase();
  const contributorName = contributor.name.trim().toLowerCase();
  if (ownerName && contributorName && ownerName === contributorName) {
    return { allowed: true, contributorId: contributor.id };
  }

  const { data: createdEvent } = await supabase
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
