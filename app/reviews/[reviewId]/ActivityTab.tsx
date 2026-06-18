"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton, TimelineDateDivider, TimelineEventCard } from "@/components/ui/ds";
import { monthGroupLabel, type TimelineEventRow } from "@/lib/timeline/events";
import { enrichTimelineEventsWithActors } from "@/lib/timeline/enrichTimelineActors";
import { enrichArtifactUploadedTimelineEvents } from "@/lib/timeline/artifactUploadedPayload";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  artifactChipHref,
  resolveArtifactOpenTarget,
} from "@/lib/artifacts/artifactOpenTarget";

type ActivityArtifact = {
  id: string;
  label: string;
  title?: string | null;
  linkUrl?: string | null;
  imageUrl?: string | null;
  type?: string | null;
};

type ActivityTabProps = {
  reviewId: string;
  reviewType?: string;
  artifacts?: ActivityArtifact[];
  changeRequestLabelById?: Map<string, string>;
  onNavigateToArtifact?: (artifactId: string) => void;
  refreshKey?: number;
};

export function ActivityTab({
  reviewId,
  reviewType,
  artifacts = [],
  changeRequestLabelById,
  onNavigateToArtifact,
  refreshKey = 0,
}: ActivityTabProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [events, setEvents] = useState<TimelineEventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const artifactIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const artifact of artifacts) {
      const label = artifact.label?.trim();
      if (label) map.set(label, artifact.id);
      const title = artifact.title?.trim();
      if (title) map.set(title, artifact.id);
      map.set(artifact.id, artifact.id);
    }
    return map;
  }, [artifacts]);

  const artifactLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const artifact of artifacts) {
      const label = artifact.label?.trim() || artifact.title?.trim() || artifact.id;
      map.set(artifact.id, label);
    }
    return map;
  }, [artifacts]);

  const artifactUrlByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const artifact of artifacts) {
      const target = resolveArtifactOpenTarget({
        linkUrl: artifact.linkUrl,
        imageUrl: artifact.imageUrl,
        fileType: artifact.type ?? undefined,
      });
      const href = artifactChipHref(target);
      if (!href) continue;
      const label = artifact.label?.trim();
      if (label) map.set(label, href);
      const title = artifact.title?.trim();
      if (title) map.set(title, href);
      map.set(artifact.id, href);
    }
    return map;
  }, [artifacts]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const reviewIdQuery = String(reviewId ?? "").trim();
      const { data, error } = await supabase
        .from("timeline_events")
        .select("id, created_at, project_id, review_id, actor_id, event_type, payload")
        .eq("review_id", reviewIdQuery)
        .order("created_at", { ascending: false });
      if (error) {
        if (cancelled) return;
        setEvents([]);
        setIsLoading(false);
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
      const withActors = await enrichTimelineEventsWithActors(supabase, mapped);
      const withArtifactUploads = await enrichArtifactUploadedTimelineEvents(
        supabase,
        withActors,
      );
      setEvents(withArtifactUploads);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reviewId, supabase, refreshKey]);

  const expandedEvents = useMemo(
    () =>
      events.flatMap((event) => {
        if (event.event_type !== "feedback_provided") {
          return [event];
        }

        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const selectedIds = Array.isArray(payload.selected_artifact_ids)
          ? payload.selected_artifact_ids.map((id) => String(id).trim()).filter(Boolean)
          : [];
        const hasSelectedNames = Array.isArray(payload.selected_artifact_names) &&
          payload.selected_artifact_names.some((name) => String(name).trim());
        if (selectedIds.length > 0 && !hasSelectedNames) {
          const selectedNames = selectedIds
            .map((id) => artifactLabelById.get(id)?.trim() || "")
            .filter(Boolean);
          if (selectedNames.length > 0) {
            return [
              {
                ...event,
                payload: {
                  ...payload,
                  selected_artifact_names: selectedNames,
                },
              },
            ];
          }
        }

        const approvedNames = Array.isArray(payload.approved_artifact_names)
          ? payload.approved_artifact_names.map((name) => String(name).trim()).filter(Boolean)
          : [];
        const changeNames = Array.isArray(payload.change_artifact_names)
          ? payload.change_artifact_names.map((name) => String(name).trim()).filter(Boolean)
          : [];
        const shouldSplit =
          changeNames.length > 0 ||
          approvedNames.length > 1 ||
          (approvedNames.length > 0 && changeNames.length > 0);

        if (!shouldSplit) {
          return [event];
        }

        const splitApproved = approvedNames.map((name, index) => ({
          ...event,
          id: `${event.id}-approved-${index}`,
          payload: {
            ...payload,
            artifact_name: name,
            approved_artifact_names: [name],
            change_artifact_names: [],
          },
        }));

        const splitChanges = changeNames.map((name, index) => ({
          ...event,
          id: `${event.id}-change-${index}`,
          event_type: "change_requested" as const,
          payload: {
            ...payload,
            artifact_name: name,
          },
        }));

        return [...splitApproved, ...splitChanges];
      }),
    [events, artifactLabelById],
  );

  const scoped = useMemo(
    () =>
      expandedEvents.filter((event) => {
        const rawEventType = String(event.event_type ?? "")
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_");
        if (rawEventType === "preference_submitted") return false;
        const eventType = event.event_type;
        if (eventType === "concept_selected") {
          const payload = (event.payload ?? {}) as Record<string, unknown>;
          const stage = String(payload.selection_stage ?? "")
            .trim()
            .toLowerCase();
          if (stage === "preference") return false;
          const reviewType = String(payload.review_type ?? "")
            .trim()
            .toLowerCase();
          if (
            (reviewType === "compare" || reviewType === "comparison") &&
            stage !== "approved_direction" &&
            stage !== "direction_update"
          ) {
            return false;
          }
          return true;
        }
        return [
          "review_created",
          "artifact_uploaded",
          "problem_added",
          "problem_edited",
          "tradeoff_added",
          "tradeoff_edited",
          "reviewer_added",
          "reviewers_notified",
          "review_focus_edited",
          "feedback_provided",
          "change_requested",
          "change_request_closed",
          "changes_requested",
          "review_approved",
          "partial_approval",
          "decision_recorded",
          "decision_made",
          "status_changed",
          "review_paused",
          "review_reactivated",
          "artifact_deleted",
          "artifact_description_edited",
        ].includes(eventType);
      }),
    [expandedEvents],
  );

  // Newest first (DESC). Same-second tiebreak (all types): status → direction → artifact → CR → feedback.
  const ordered = useMemo(() => {
    const tieRank = (event: TimelineEventRow) => {
      const eventType = event.event_type;
      if (eventType === "status_changed") return 0;
      if (eventType === "review_paused" || eventType === "review_reactivated") return 0;
      if (eventType === "concept_selected") {
        const stage = String(
          (event.payload as Record<string, unknown>)?.selection_stage ?? "",
        )
          .trim()
          .toLowerCase();
        if (
          stage === "approved_direction" ||
          stage === "direction_update" ||
          stage === "preference"
        ) {
          return 1;
        }
        return 4;
      }
      if (eventType === "review_approved" || eventType === "partial_approval") {
        return 2;
      }
      if (eventType === "change_requested" || eventType === "change_request_closed" || eventType === "changes_requested") {
        return 3;
      }
      if (eventType === "feedback_provided") return 4;
      return 5;
    };
    const sortSecond = (iso: string) => {
      const ms = new Date(iso).getTime();
      return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
    };
    return [...scoped]
      .map((event, index) => ({ event, index }))
      .sort((a, b) => {
        const diff = sortSecond(b.event.created_at) - sortSecond(a.event.created_at);
        if (diff !== 0) return diff;
        const rankDiff = tieRank(a.event) - tieRank(b.event);
        if (rankDiff !== 0) return rankDiff;
        return a.index - b.index;
      })
      .map(({ event }) => event);
  }, [scoped]);

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
          {isLoading
            ? Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={`activity-skeleton-${index}`}
                  className="flex items-start gap-3 py-3"
                >
                  <Skeleton
                    shape="Circular"
                    waveAnimation
                    className="mt-1.5 h-[10px] w-[10px]"
                  />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Skeleton
                        shape="Text"
                        waveAnimation
                        className="w-[80px]"
                      />
                      <Skeleton
                        shape="Text"
                        waveAnimation
                        className="w-[120px]"
                      />
                    </div>
                    <Skeleton
                      shape="Text"
                      waveAnimation
                      className="h-[10px] w-[60px]"
                    />
                  </div>
                </div>
              ))
            : ordered.map((event, index) => {
                const next = ordered[index + 1];
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
                      actorContributorId={
                        event.actor?.id ?? event.actor_id ?? undefined
                      }
                      actorContributorEmail={event.actor?.email ?? undefined}
                      changeRequestLabelById={changeRequestLabelById}
                      payload={(event.payload ?? {}) as Record<string, any>}
                      timestamp={event.created_at}
                      onReviewClick={(id) => router.push(`/reviews/${id}`)}
                      onArtifactClick={onNavigateToArtifact}
                      artifactIdByName={artifactIdByName}
                      artifactLabelById={artifactLabelById}
                      artifactUrlByName={artifactUrlByName}
                      projectId={event.project_id}
                    />
                    {showDivider ? <TimelineDateDivider label={currentMonth} /> : null}
                  </div>
                );
              })}
          {!isLoading && ordered.length === 0 ? (
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
