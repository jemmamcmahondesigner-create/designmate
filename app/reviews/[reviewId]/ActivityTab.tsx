"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { TimelineDateDivider, TimelineEventCard } from "@/components/ui/ds";
import { monthGroupLabel, type TimelineEventRow } from "@/lib/timeline/events";
import { fetchContactDisplayNames } from "@/lib/contacts/fetchContactDisplayNames";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

type ActivityTabProps = {
  reviewId: string;
};

export function ActivityTab({ reviewId }: ActivityTabProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [events, setEvents] = useState<TimelineEventRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const reviewIdQuery = String(reviewId ?? "").trim();
      const { data, error } = await supabase
        .from("timeline_events")
        .select("id, created_at, project_id, review_id, actor_id, event_type, payload")
        .eq("review_id", reviewIdQuery)
        .order("created_at", { ascending: false });
      if (error) {
        setEvents([]);
        return;
      }
      if (cancelled) return;
      const mapped: TimelineEventRow[] = (data ?? []).map((row) => {
        const r = row as Record<string, any>;
        return {
          id: String(r.id ?? ""),
          created_at: String(r.created_at ?? ""),
          project_id: r.project_id == null ? null : String(r.project_id),
          review_id: r.review_id == null ? null : String(r.review_id),
          actor_id: r.actor_id == null ? null : String(r.actor_id),
          event_type: String(r.event_type ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_") as TimelineEventRow["event_type"],
          payload: (r.payload ?? {}) as Record<string, unknown>,
          actor: null
        };
      });
      const actorIds = [
        ...new Set(
          mapped.map((e) => e.actor_id).filter((id): id is string => Boolean(id && id.trim()))
        ),
      ];
      const nameMap = await fetchContactDisplayNames(supabase, actorIds);
      const withNames = mapped.map((event) => {
        const aid = event.actor_id;
        const resolved =
          aid && nameMap.has(aid) ? (nameMap.get(aid) as string) : undefined;
        return {
          ...event,
          actor:
            resolved != null
              ? { id: aid as string, name: resolved, avatar_url: null }
              : null,
        };
      });
      setEvents(withNames);
    })();
    return () => {
      cancelled = true;
    };
  }, [reviewId, supabase]);

  const scoped = useMemo(
    () =>
      events.filter((event) =>
        [
          "review_created",
          "artifact_uploaded",
          "reviewer_added",
          "review_focus_edited",
          "feedback_provided",
          "changes_requested",
          "concept_selected",
          "review_approved",
          "partial_approval",
          "decision_recorded",
          "decision_made",
          "status_changed",
          "artifact_deleted"
        ].includes(event.event_type)
      ),
    [events]
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className="relative box-border w-full min-w-0 px-[32px] py-[32px]">
        <div className="relative w-full min-w-0">
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 z-0 w-10"
            aria-hidden
          >
            <div
              className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
              style={{ backgroundColor: "#e7e2da" }}
            />
          </div>
          <div className="relative z-10 flex min-w-0 flex-col gap-[8px]">
          {scoped.map((event, index) => {
            const next = scoped[index + 1];
            const currentMonth = monthGroupLabel(event.created_at);
            const showDivider =
              next == null || monthGroupLabel(next.created_at) !== currentMonth;
            return (
              <div key={event.id}>
                <TimelineEventCard
                  eventType={event.event_type}
                  actorName={
                    event.actor?.name?.trim()
                      ? event.actor.name
                      : (event.payload as Record<string, unknown>)?.actor_name == null
                        ? undefined
                        : String((event.payload as Record<string, unknown>).actor_name)
                  }
                  actorAvatarUrl={event.actor?.avatar_url ?? undefined}
                  payload={(event.payload ?? {}) as Record<string, any>}
                  timestamp={event.created_at}
                  onReviewClick={(id) => router.push(`/reviews/${id}`)}
                />
                {showDivider ? <TimelineDateDivider label={currentMonth} /> : null}
              </div>
            );
          })}
          {scoped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <p className="text-[14px]" style={{ color: "#6b5e55" }}>No activity yet</p>
              <p className="text-[12px]" style={{ color: "#998c82" }}>
                Events will appear here as this review progresses
              </p>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
