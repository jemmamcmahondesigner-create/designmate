export type TimelineEventType =
  | "project_created"
  | "problem_added"
  | "problem_edited"
  | "teammate_added"
  | "review_created"
  | "artifact_uploaded"
  | "review_focus_edited"
  | "tradeoff_added"
  | "tradeoff_edited"
  | "feedback_provided"
  | "changes_requested"
  | "change_requested"
  | "change_request_closed"
  | "concept_selected"
  | "review_approved"
  | "partial_approval"
  | "reviewer_added"
  | "reviewers_notified"
  | "status_changed"
  | "review_paused"
  | "review_reactivated"
  | "decision_recorded"
  | "decision_made"
  | "review_deleted"
  | "artifact_deleted"
  | "artifact_description_edited"
  | "project_updated"
  | "access_requested"
  | "access_granted";

export type TimelineEventRow = {
  id: string;
  created_at: string;
  project_id: string | null;
  review_id: string | null;
  actor_id: string | null;
  event_type: TimelineEventType;
  payload: Record<string, unknown> | null;
  actor?: {
    id: string;
    user_id?: string | null;
    email?: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
};

function formatMonthDay(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatTimelineTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const isSameYear = now.getFullYear() === date.getFullYear();
  const dateLabel = isSameYear
    ? formatMonthDay(date)
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  const timeLabel = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateLabel}, ${timeLabel}`;
}

export function shouldShowTimelineTimestampTooltip(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return Math.abs(Date.now() - date.getTime()) >= 60 * 60 * 1000;
}

export function formatTimelineTimestampTooltip(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dateLabel = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeLabel = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateLabel} at ${timeLabel.toLowerCase()}`;
}

export function monthGroupLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (now.getFullYear() === date.getFullYear()) {
    return formatMonthDay(date);
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Calendar day label for timeline grouping: Today / Yesterday / "6 May". */
export function calendarDayGroupLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (date.toDateString() === y.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export { includeInProjectTimeline } from "./includeInProjectTimeline";
