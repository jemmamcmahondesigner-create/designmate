import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TimelineEventType } from "@/lib/timeline/events";
import { resolveCanonicalTimelineActor } from "@/lib/timeline/enrichTimelineActors";
import { resolveCanonicalContributorIds } from "@/lib/contributors/resolveCanonicalContributorIds";

type TimelineInsertInput = {
  projectId?: string | null;
  reviewId?: string | null;
  actorId?: string | null;
  eventType: TimelineEventType;
  payload?: Record<string, unknown>;
};

export async function logTimelineEventClient(input: TimelineInsertInput) {
  const supabase = createSupabaseBrowserClient();
  let actorId = input.actorId ?? null;
  let actorName: string | null = null;
  try {
    if (!actorId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const authUserId = user?.id?.trim();
      if (authUserId) {
        const byAuthUser = await resolveCanonicalContributorIds(supabase, [authUserId]);
        const match = byAuthUser.get(authUserId);
        if (match) {
          actorId = match.contributorId;
          actorName = match.name;
        } else if (user?.email) {
          const byEmail = await supabase
            .from("contributors")
            .select("id, name")
            .ilike("email", user.email)
            .limit(1)
            .maybeSingle();
          if (!byEmail.error && byEmail.data) {
            const rawId = String((byEmail.data as Record<string, unknown>).id ?? "");
            const canonical = await resolveCanonicalTimelineActor(supabase, rawId);
            actorId = canonical.contributorId ?? rawId;
            actorName =
              canonical.name ??
              ((byEmail.data as Record<string, unknown>).name == null
                ? null
                : String((byEmail.data as Record<string, unknown>).name));
          }
        }
      }
    }
  } catch {
    actorId = input.actorId ?? null;
  }

  if (actorId?.trim()) {
    const canonical = await resolveCanonicalTimelineActor(supabase, actorId);
    actorId = canonical.contributorId;
    actorName = actorName ?? canonical.name;
  }

  const payload = {
    ...(input.payload ?? {}),
    ...(actorName ? { actor_name: actorName } : {})
  };

  const { error: insertError } = await supabase.from("timeline_events").insert({
    project_id: input.projectId ?? null,
    review_id: input.reviewId ?? null,
    actor_id: actorId || null,
    event_type: input.eventType,
    payload
  });

  if (insertError) {
    console.error(
      "[logTimelineEventClient] insert failed:",
      insertError.message,
      input.eventType,
    );
  }
}
