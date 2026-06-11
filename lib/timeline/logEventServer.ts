import type { SupabaseClient } from "@supabase/supabase-js";

import type { TimelineEventType } from "@/lib/timeline/events";

import { getEffectiveCurrentContributor } from "@/lib/auth/effectiveContributor";

import { resolveCanonicalTimelineActor } from "@/lib/timeline/enrichTimelineActors";

import { resolveCanonicalContributorIds } from "@/lib/contributors/resolveCanonicalContributorIds";



type TimelineInsertInput = {

  projectId?: string | null;

  reviewId?: string | null;

  actorId?: string | null;

  eventType: TimelineEventType;

  payload?: Record<string, unknown>;

  /** When set, all events from one batch share the same timestamp. */

  createdAt?: string;

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

        const byAuthUser = await resolveCanonicalContributorIds(supabase, [authUserId]);

        const match = byAuthUser.get(authUserId);

        if (match) {

          actorId = match.contributorId;

          actorName = match.name;

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

    payload,

    ...(input.createdAt ? { created_at: input.createdAt } : {}),

  });

  if (insertError) {
    console.error(
      "[logTimelineEventServer] insert failed:",
      insertError.message,
      input.eventType,
    );
  }

}

