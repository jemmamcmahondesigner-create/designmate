import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TimelineEventType } from "@/lib/timeline/events";

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
        } else if (user?.email) {
          const byEmail = await supabase
            .from("contributors")
            .select("id, name")
            .ilike("email", user.email)
            .limit(1)
            .maybeSingle();
          if (!byEmail.error && byEmail.data) {
            actorId = String((byEmail.data as Record<string, unknown>).id ?? "");
            actorName =
              (byEmail.data as Record<string, unknown>).name == null
                ? null
                : String((byEmail.data as Record<string, unknown>).name);
          }
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
