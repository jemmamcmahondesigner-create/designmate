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

/**
 * Resolve any raw actor reference to a contributors.id before insert.
 * Never insert an auth.users id — timeline_events.actor_id FKs to contributors(id).
 */
async function resolveTimelineActorId(
  supabase: SupabaseClient,
  input: TimelineInsertInput,
): Promise<{ actorId: string | null; actorName: string | null }> {
  let actorId = input.actorId?.trim() || null;
  let actorName: string | null = null;

  if (actorId) {
    const canonical = await resolveCanonicalTimelineActor(supabase, actorId);
    actorId = canonical.contributorId;
    actorName = canonical.name;
  }

  if (!actorId) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const authUserId = user?.id?.trim();
      if (authUserId) {
        const byAuthUser = await resolveCanonicalContributorIds(supabase, [
          authUserId,
        ]);
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
            const rawId = String(
              (byEmail.data as Record<string, unknown>).id ?? "",
            ).trim();
            const canonical = await resolveCanonicalTimelineActor(supabase, rawId);
            actorId = canonical.contributorId ?? (rawId || null);
            actorName =
              canonical.name ??
              ((byEmail.data as Record<string, unknown>).name == null
                ? null
                : String((byEmail.data as Record<string, unknown>).name));
            // rawId is already a contributors.id from the email query; keep it if
            // canonicalization returned null (should not happen for a real row).
            if (!actorId && rawId) actorId = rawId;
          }
        }
        if (!actorId) {
          const contributor = await getEffectiveCurrentContributor(
            supabase,
            input.projectId ?? undefined,
          );
          const resolvedId = contributor?.id?.trim() || null;
          actorName = contributor?.name ?? null;
          if (resolvedId) {
            const canonical = await resolveCanonicalTimelineActor(
              supabase,
              resolvedId,
            );
            // Prefer canonical id; fall back to the contributors.id we already loaded.
            actorId = canonical.contributorId ?? resolvedId;
            actorName = actorName ?? canonical.name;
          }
        }
      }
    } catch {
      actorId = null;
    }
  }

  return { actorId: actorId || null, actorName };
}

export async function logTimelineEventServer(
  supabase: SupabaseClient,
  input: TimelineInsertInput,
) {
  const { actorId, actorName } = await resolveTimelineActorId(supabase, input);

  const payload = {
    ...(input.payload ?? {}),
    ...(actorName ? { actor_name: actorName } : {}),
  };

  const { error: insertError } = await supabase.from("timeline_events").insert({
    project_id: input.projectId ?? null,
    review_id: input.reviewId ?? null,
    actor_id: actorId,
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
    return { ok: false as const, error: insertError.message };
  }

  return { ok: true as const };
}
