/**
 * Project timeline filter — standalone module (avoids any `events` module resolution edge cases).
 */

export type ProjectTimelineEventLike = {
  event_type: string;
  payload: Record<string, unknown> | null;
};

const STATUS_TIMELINE_HIGH_SIGNAL = new Set([
  "complete",
  "approved",
  "changes-needed",
  "needs-changes",
]);

/** Project-level timeline: high-signal events only. */
export function includeInProjectTimeline(event: ProjectTimelineEventLike): boolean {
  const t = event.event_type;
  if (t === "feedback_provided") return false;
  if (
    t === "review_created" ||
    t === "concept_selected" ||
    t === "decision_recorded" ||
    t === "decision_made" ||
    t === "review_paused" ||
    t === "review_reactivated"
  ) {
    return true;
  }
  if (t === "source_added" || t === "source_deleted") return true;
  if (t === "project_updated") return true;
  if (t === "status_changed") {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const entity = String(payload.entity ?? "")
      .trim()
      .toLowerCase();
    if (entity === "project") return true;
    if (
      entity === "review" &&
      String(payload.status_transition_trigger ?? "")
        .trim()
        .toLowerCase() === "auto"
    ) {
      return true;
    }
    const to = String(payload.to_status ?? payload.new_status ?? payload.to ?? "")
      .trim()
      .toLowerCase();
    return STATUS_TIMELINE_HIGH_SIGNAL.has(to);
  }
  return false;
}
