import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchContactDisplayNames } from "@/lib/contacts/fetchContactDisplayNames";
import { resolveCanonicalContributorIds } from "@/lib/contributors/resolveCanonicalContributorIds";
import type { TimelineEventRow } from "@/lib/timeline/events";

/** Raw actor reference from a timeline row (column or legacy payload field). */
export function timelineEventRawActorId(event: TimelineEventRow): string | null {
  const fromColumn = event.actor_id?.trim();
  if (fromColumn) return fromColumn;
  const payloadActor = (event.payload as Record<string, unknown> | null)?.actor_id;
  if (typeof payloadActor === "string" && payloadActor.trim()) {
    return payloadActor.trim();
  }
  return null;
}

/**
 * Resolve timeline actor_id values to canonical workspace contributors.id
 * (same UUID teammates/settings use for avatar colours).
 *
 * timeline_events.actor_id FK → contributors.id, but rows may store a
 * project-scoped contributor id rather than the workspace-scoped canonical id.
 */
export async function enrichTimelineEventsWithActors(
  supabase: SupabaseClient,
  events: TimelineEventRow[],
): Promise<TimelineEventRow[]> {
  const rawIds = [
    ...new Set(
      events
        .map(timelineEventRawActorId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (rawIds.length === 0) {
    return events.map((event) => ({ ...event, actor: null }));
  }

  const resolution = await resolveCanonicalContributorIds(supabase, rawIds);
  const emailByContributorId = new Map<string, string>();
  for (const match of resolution.values()) {
    const email = match.email?.trim();
    if (email) {
      emailByContributorId.set(match.contributorId, email);
    }
  }

  const idsNeedingNames = [
    ...new Set(
      rawIds.flatMap((rawId) => {
        const match = resolution.get(rawId);
        return match ? [match.contributorId, rawId] : [rawId];
      }),
    ),
  ];
  const nameMap = await fetchContactDisplayNames(supabase, idsNeedingNames);

  return events.map((event) => {
    const rawId = timelineEventRawActorId(event);
    if (!rawId) {
      return { ...event, actor: null };
    }

    const resolved = resolution.get(rawId);
    const canonicalId = resolved?.contributorId ?? rawId;
    const payloadName = (event.payload as Record<string, unknown> | null)?.actor_name;
    const name =
      resolved?.name?.trim() ||
      nameMap.get(canonicalId)?.trim() ||
      nameMap.get(rawId)?.trim() ||
      (typeof payloadName === "string" ? payloadName.trim() : "") ||
      null;

    return {
      ...event,
      actor: {
        id: canonicalId,
        user_id: resolved?.userId ?? null,
        email: emailByContributorId.get(canonicalId) ?? resolved?.email ?? null,
        name,
        avatar_url: null,
      },
    };
  });
}

/** Canonicalize a single actor reference before writing timeline_events. */
export async function resolveCanonicalTimelineActor(
  supabase: SupabaseClient,
  rawActorId: string | null | undefined,
): Promise<{ contributorId: string | null; name: string | null }> {
  const trimmed = rawActorId?.trim();
  if (!trimmed) return { contributorId: null, name: null };
  const resolution = await resolveCanonicalContributorIds(supabase, [trimmed]);
  const match = resolution.get(trimmed);
  if (match) {
    return { contributorId: match.contributorId, name: match.name };
  }
  // Never pass through unresolved ids (e.g. auth.users id) — FK is contributors(id).
  return { contributorId: null, name: null };
}
