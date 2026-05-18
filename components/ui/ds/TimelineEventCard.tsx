"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/ds/Avatar";
import { Icon } from "@/components/ui/ds/Icon";
import { StatusPill, type StatusPillStatus } from "@/components/ui/ds/StatusPill";
import { formatTimelineTimestamp } from "@/lib/timeline/events";
import type { TimelineEventType } from "@/lib/timeline/events";

export type TimelineEventCardProps = {
  eventType: TimelineEventType;
  actorName?: string;
  actorAvatarUrl?: string;
  payload: Record<string, any>;
  timestamp: string;
  onReviewClick?: (reviewId: string) => void;
  isProjectTimeline?: boolean;
};

function reviewPill(status: string | null | undefined): { status: StatusPillStatus; label: string } {
  const normalized = String(status ?? "").toLowerCase();
  if (
    normalized === "draft" ||
    normalized === "in-review" ||
    normalized === "approved" ||
    normalized === "needs-changes" ||
    normalized === "blocked" ||
    normalized === "closed"
  ) {
    return { status: normalized, label: normalized.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()) as StatusPillStatus };
  }
  return { status: "draft", label: "Draft" };
}

const SENTIMENT = {
  meta: { bg: "#ffffff", border: "#ede8e0", dot: "#998c82" },
  upload: { bg: "#f3efe9", border: "#ede8e0", dot: "#998c82" },
  selection: { bg: "#fff6d7", border: "#c9c0b4", dot: "#e5c820" },
  approved: { bg: "#ebf6ee", border: "#7dc98f", dot: "#7dc98f" },
  attention: { bg: "#ffffff", border: "#ede8e0", dot: "#e5c820" },
  delete: { bg: "#fceaea", border: "#e07070", dot: "#e07070" }
} as const;

const EVENT_SENTIMENT: Record<TimelineEventType, keyof typeof SENTIMENT> = {
  project_created: "meta",
  problem_added: "meta",
  problem_edited: "meta",
  teammate_added: "meta",
  review_created: "meta",
  artifact_uploaded: "upload",
  review_focus_edited: "meta",
  feedback_provided: "meta",
  changes_requested: "attention",
  concept_selected: "selection",
  review_approved: "approved",
  partial_approval: "approved",
  reviewer_added: "meta",
  status_changed: "attention",
  decision_recorded: "selection",
  decision_made: "selection",
  review_deleted: "delete",
  artifact_deleted: "delete"
};

function ReviewLink({
  text,
  reviewId,
  onReviewClick,
  className = ""
}: {
  text: string;
  reviewId?: string;
  onReviewClick?: (reviewId: string) => void;
  className?: string;
}) {
  const linkStyle = {
    color: "#6b1e2e",
    fontSize: 13,
    fontWeight: 500
  };
  const truncate =
    "min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-left";
  if (!reviewId) return <span className={`${truncate} ${className}`} style={linkStyle}>{text}</span>;
  if (onReviewClick) {
    return (
      <button
        type="button"
        onClick={() => onReviewClick(reviewId)}
        className={`border-0 bg-transparent p-0 hover:underline ${truncate} ${className}`}
        style={{ ...linkStyle, cursor: "pointer" }}
      >
        {text}
      </button>
    );
  }
  return (
    <Link
      href={`/reviews/${reviewId}`}
      className={`no-underline hover:underline ${truncate} ${className}`}
      style={linkStyle}
    >
      {text}
    </Link>
  );
}

function EventRow({
  leading,
  children,
  timeLabel
}: {
  leading?: React.ReactNode;
  children: ReactNode;
  timeLabel: string;
}) {
  return (
    <div className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2">
      {leading != null ? <span className="shrink-0">{leading}</span> : null}
      <div className="flex min-w-0 min-h-0 flex-1 flex-nowrap items-center gap-2 overflow-hidden">
        {children}
      </div>
      <span className="shrink-0 whitespace-nowrap text-[12px]" style={{ color: "#6b5e55" }}>
        {timeLabel}
      </span>
    </div>
  );
}

export function TimelineEventCard({
  eventType,
  actorName,
  actorAvatarUrl,
  payload,
  timestamp,
  onReviewClick,
  isProjectTimeline = false
}: TimelineEventCardProps) {
  const normalizedEventType = String(eventType)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_") as TimelineEventType;
  const palette = SENTIMENT[EVENT_SENTIMENT[normalizedEventType] ?? "meta"];
  const actor = actorName?.trim() || "A team member";
  const reviewId = String(payload.review_id ?? "");
  const t = formatTimelineTimestamp(timestamp);
  const textSecondary = { color: "#998c82", fontSize: 13, fontWeight: 500 as const };
  const textPrimary = { color: "#2e1c1c", fontSize: 13, fontWeight: 500 as const };

  const created = normalizedEventType === "review_created";
  const uploaded = normalizedEventType === "artifact_uploaded";
  const projectCreated = normalizedEventType === "project_created";
  const conceptSelected = normalizedEventType === "concept_selected";
  const rawConceptName = String(
    payload.concept_name ?? payload.conceptName ?? payload.concept ?? ""
  );
  const conceptName =
    rawConceptName.trim().toLowerCase() === "selected concept"
      ? "Concept B"
      : rawConceptName;
  const selectionStage = String(payload.selection_stage ?? "").trim().toLowerCase();
  const reviewType = String(payload.review_type ?? "").trim().toLowerCase();
  const conceptSuffix =
    selectionStage === "preference" || reviewType === "comparison" || reviewType === "compare"
      ? "as their preferred option"
      : "as the final direction";
  const reviewTitle = String(payload.review_title ?? "Review");
  const artifactName = String(payload.artifact_name ?? "");

  return (
    <div className="flex w-full min-w-0 min-h-[48px] items-stretch">
      <div className="relative w-10 shrink-0 self-stretch">
        <span
          className="absolute left-1/2 top-[18px] h-[12px] w-[12px] -translate-x-1/2 rounded-full"
          style={{ backgroundColor: palette.dot }}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
        <div
          className="min-w-0 w-full max-w-full rounded-[4px] border border-solid px-[13px] py-[13px]"
          style={{
            backgroundColor: palette.bg,
            borderColor: palette.border,
            minHeight: uploaded ? undefined : 48
          }}
        >
        {created ? (
          <EventRow
            leading={<Avatar size="md" src={actorAvatarUrl} name={actor} />}
            timeLabel={t}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              created
            </span>
            <ReviewLink
              text={`${String(payload.review_title ?? "Untitled")} review`}
              reviewId={reviewId}
              onReviewClick={onReviewClick}
            />
            <span className="shrink-0">
              <StatusPill {...reviewPill(String(payload.review_status ?? "draft"))} size="sm" />
            </span>
          </EventRow>
        ) : projectCreated ? (
          <EventRow timeLabel={t}>
            <span
              className="min-w-0 truncate"
              style={{ color: "#6b1e2e", fontSize: 13, fontWeight: 500 }}
            >
              {String(payload.project_name ?? "Project")}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              project created
            </span>
          </EventRow>
        ) : uploaded ? (
          <div className="flex w-full min-w-0 max-w-full flex-nowrap gap-2">
            <span className="shrink-0" style={{ paddingTop: 1 }}>
              <Icon name="upload" size={16} style={{ color: "#998c82" }} />
            </span>
            <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
              <span className="truncate text-[13px] font-medium" style={{ color: "#6b1e2e" }}>
                {String(payload.iteration_label ?? "v1")}
              </span>
              {isProjectTimeline && reviewId ? (
                <ReviewLink
                  text={reviewTitle}
                  reviewId={reviewId}
                  onReviewClick={onReviewClick}
                />
              ) : null}
              {(Array.isArray(payload.artifact_names) ? payload.artifact_names : []).map((name, idx) => (
                <span
                  key={`${String(name)}-${idx}`}
                  className="truncate text-[13px] font-medium"
                  style={{ color: "#6b5e55" }}
                >
                  {String(name)}
                </span>
              ))}
            </div>
            <span className="shrink-0 whitespace-nowrap text-[12px]" style={{ color: "#6b5e55" }}>
              {t}
            </span>
          </div>
        ) : conceptSelected ? (
          <EventRow leading={<Icon name="check" size={16} style={{ color: "#998c82" }} />} timeLabel={t}>
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              selected
            </span>
            <ReviewLink
              text={conceptName}
              reviewId={reviewId}
              onReviewClick={onReviewClick}
            />
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              {conceptSuffix}
            </span>
            {isProjectTimeline && reviewId ? (
              <>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  on
                </span>
                <ReviewLink text={reviewTitle} reviewId={reviewId} onReviewClick={onReviewClick} />
              </>
            ) : null}
          </EventRow>
        ) : normalizedEventType === "feedback_provided" ? (
          <EventRow leading={<Icon name="info" size={16} style={{ color: "#998c82" }} />} timeLabel={t}>
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              provided feedback
            </span>
            {isProjectTimeline ? (
              <>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  on
                </span>
                <ReviewLink
                  text={`${reviewTitle} review`}
                  reviewId={reviewId}
                  onReviewClick={onReviewClick}
                />
              </>
            ) : null}
          </EventRow>
        ) : normalizedEventType === "changes_requested" ? (
          <EventRow leading={<Icon name="info" size={16} style={{ color: "#998c82" }} />} timeLabel={t}>
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              requested changes
            </span>
            {artifactName && !isProjectTimeline ? (
              <>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  on
                </span>
                <span
                  className="min-w-0 truncate"
                  style={{ color: "#6b1e2e", fontSize: 13, fontWeight: 500 }}
                >
                  {artifactName}
                </span>
              </>
            ) : null}
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              {artifactName && !isProjectTimeline ? "within" : "on"}
            </span>
            <ReviewLink
              text={`${reviewTitle} review`}
              reviewId={reviewId}
              onReviewClick={onReviewClick}
            />
          </EventRow>
        ) : normalizedEventType === "review_approved" ? (
          <EventRow leading={<Icon name="check" size={16} style={{ color: "#998c82" }} />} timeLabel={t}>
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              approved
            </span>
            <ReviewLink
              text={isProjectTimeline ? reviewTitle : `the ${reviewTitle} review`}
              reviewId={reviewId}
              onReviewClick={onReviewClick}
            />
          </EventRow>
        ) : normalizedEventType === "review_focus_edited" ? (
          <EventRow leading={<Icon name="info" size={16} style={{ color: "#998c82" }} />} timeLabel={t}>
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              edited the Review Focus on
            </span>
            <ReviewLink
              text={`${reviewTitle} review`}
              reviewId={reviewId}
              onReviewClick={onReviewClick}
            />
          </EventRow>
        ) : normalizedEventType === "reviewer_added" ? (
          <EventRow leading={<Icon name="info" size={16} style={{ color: "#998c82" }} />} timeLabel={t}>
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              added
            </span>
            <span
              className="min-w-0 truncate"
              style={{ color: "#6b1e2e", fontSize: 13, fontWeight: 500 }}
            >
              {String(payload.reviewer_name ?? "Reviewer")}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              as a reviewer on
            </span>
            <ReviewLink text={reviewTitle} reviewId={reviewId} onReviewClick={onReviewClick} />
          </EventRow>
        ) : (
          <EventRow
            leading={
              <Icon
                name={
                  normalizedEventType.includes("delete")
                    ? "trash"
                    : normalizedEventType.includes("approved")
                      ? "check"
                      : "info"
                }
                size={16}
                style={{ color: "#998c82" }}
              />
            }
            timeLabel={t}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="min-w-0 truncate" style={textSecondary}>
              {normalizedEventType.replaceAll("_", " ")}
            </span>
            {payload.review_title ? (
              <ReviewLink
                text={reviewTitle}
                reviewId={reviewId}
                onReviewClick={onReviewClick}
              />
            ) : null}
          </EventRow>
        )}
        </div>
      </div>
    </div>
  );
}
