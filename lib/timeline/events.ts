export type TimelineEventType =
  | "project_created"
  | "problem_added"
  | "problem_edited"
  | "teammate_added"
  | "review_created"
  | "artifact_uploaded"
  | "review_focus_edited"
  | "feedback_provided"
  | "changes_requested"
  | "concept_selected"
  | "review_approved"
  | "partial_approval"
  | "reviewer_added"
  | "status_changed"
  | "decision_recorded"
  | "decision_made"
  | "review_deleted"
  | "artifact_deleted";

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
    name: string | null;
    avatar_url: string | null;
  } | null;
};

export function formatTimelineTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const isSameYear = now.getFullYear() === date.getFullYear();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const sameDay = now.toDateString() === date.toDateString();
  if (sameDay) return time;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) return `Yesterday, ${time}`;

  if (isSameYear) {
    const monthDay = date.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${monthDay}, ${time}`;
  }

  const monthDayYear = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  return `${monthDayYear}, ${time}`;
}

export function monthGroupLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.toLocaleDateString([], { month: "long" }).toUpperCase();
  return `${month}, ${date.getFullYear()}`;
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
