"use client";

import { useEffect, useMemo, useState } from "react";
import { TimelineDateDivider, TimelineEventCard } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { enrichTimelineEventsWithActors } from "@/lib/timeline/enrichTimelineActors";
import {
  calendarDayGroupLabel,
  includeInProjectTimeline,
  type TimelineEventRow,
} from "@/lib/timeline/events";

type TimelineTabProps = {
  projectId: string;
};

export function TimelineTab({ projectId }: TimelineTabProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [events, setEvents] = useState<TimelineEventRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const projectIdQuery = String(projectId ?? "").trim();
      const { data: eventRows, error } = await supabase
        .from("timeline_events")
        .select("id, created_at, project_id, review_id, actor_id, event_type, payload")
        .eq("project_id", projectIdQuery)
        .order("created_at", { ascending: false });
      if (error) {
        setEvents([]);
        return;
      }
      if (cancelled) return;
      const mapped: TimelineEventRow[] = (eventRows ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id ?? ""),
          created_at: String(r.created_at ?? ""),
          project_id: r.project_id == null ? null : String(r.project_id),
          review_id: r.review_id == null ? null : String(r.review_id),
          actor_id: r.actor_id == null ? null : String(r.actor_id),
          event_type: String(r.event_type ?? "")
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_") as TimelineEventRow["event_type"],
          payload: (r.payload ?? {}) as Record<string, unknown>,
          actor: null,
        };
      });
      const withActors = await enrichTimelineEventsWithActors(supabase, mapped);
      setEvents(withActors);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (typeof includeInProjectTimeline !== "function") {
      console.warn(
        "[TimelineTab] includeInProjectTimeline is not a function; showing unfiltered events.",
      );
      return events;
    }
    return events.filter(includeInProjectTimeline);
  }, [events]);

  return (
    <div className="relative w-full min-h-0 min-w-0 pb-4">
      <div className="relative w-full min-w-0">
        <div
          className="pointer-events-none absolute bottom-0 left-0 top-0 z-0 w-10"
          aria-hidden
        >
          <div
            className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
            style={{ backgroundColor: "#e7e2da" }}
          />
        </div>
        <div className="relative z-10">
          {events === null ? (
            <div className="flex flex-col gap-[8px]">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-[48px] w-full animate-pulse rounded-[4px]"
                  style={{ backgroundColor: "#f3efe9" }}
                />
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="text-[14px]" style={{ color: "#6b5e55" }}>
                No activity yet
              </p>
              <p className="text-[12px]" style={{ color: "#998c82" }}>
                Events will appear here as this project progresses
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-[8px]">
              {filteredEvents.map((event, index) => {
                const prev = index > 0 ? filteredEvents[index - 1] : null;
                const dayLabel = calendarDayGroupLabel(event.created_at);
                const showDayDivider =
                  prev != null &&
                  calendarDayGroupLabel(event.created_at) !==
                    calendarDayGroupLabel(prev.created_at);
                return (
                  <div key={event.id}>
                    {showDayDivider ? (
                      <TimelineDateDivider label={dayLabel} balanced />
                    ) : null}
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
                      actorContributorId={event.actor?.id ?? undefined}
                      payload={(event.payload ?? {}) as Record<string, any>}
                      timestamp={event.created_at}
                      isProjectTimeline
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
