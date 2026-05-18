import type { SupabaseClient } from "@supabase/supabase-js";
import type { TimelineEventType } from "@/lib/timeline/events";
import { getEffectiveCurrentContributor } from "@/lib/auth/effectiveContributor";

type TimelineInsertInput = {
  projectId?: string | null;
  reviewId?: string | null;
  actorId?: string | null;
  eventType: TimelineEventType;
  payload?: Record<string, unknown>;
};

export async function logTimelineEventServer(
  supabase: SupabaseClient,
  input: TimelineInsertInput
) {
  let actorId = input.actorId ?? null;
  let actorName: string | null = null;
  try {
    if (!actorId) {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const authUserId = user?.id?.trim();
      if (authUserId) {
        const byUserId = await supabase
          .from("contributors")
          .select("id, name")
          .eq("user_id", authUserId)
          .limit(1)
          .maybeSingle();
        if (!byUserId.error && byUserId.data) {
          actorId = String((byUserId.data as Record<string, unknown>).id ?? "");
          actorName =
            (byUserId.data as Record<string, unknown>).name == null
              ? null
              : String((byUserId.data as Record<string, unknown>).name);
        } else {
          const contributor = await getEffectiveCurrentContributor(
            supabase,
            input.projectId ?? undefined
          );
          actorId = contributor?.id ?? null;
          actorName = contributor?.name ?? null;
        }
      }
    }
  } catch {
    actorId = input.actorId ?? null;
  }
  const payload = {
    ...(input.payload ?? {}),
    ...(actorName ? { actor_name: actorName } : {})
  };
  await supabase.from("timeline_events").insert({
    project_id: input.projectId ?? null,
    review_id: input.reviewId ?? null,
    actor_id: actorId || null,
    event_type: input.eventType,
    payload
  });
}
