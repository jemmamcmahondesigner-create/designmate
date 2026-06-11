"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/ds/Avatar";
import { Icon } from "@/components/ui/ds/Icon";
import { StatusPill, type StatusPillStatus } from "@/components/ui/ds/StatusPill";
import { Tag } from "@/components/ui/ds/Tag";
import { resolveChangeRequestTagLabel } from "@/lib/reviews/changeRequestLabels";
import {
  formatTimelineTimestamp,
  formatTimelineTimestampTooltip,
  shouldShowTimelineTimestampTooltip,
} from "@/lib/timeline/events";
import type { TimelineEventType } from "@/lib/timeline/events";
import { Tooltip } from "@/components/ui/ds/Tooltip";
import {
  normalizeReviewStatusKey,
  STATUS_DISPLAY_LABELS,
} from "@/lib/reviews/reviewStatusDisplay";
import { getAvatarInlineStyle } from "@/lib/utils/avatarColour";

export type TimelineEventCardProps = {
  eventType: TimelineEventType;
  actorName?: string;
  actorAvatarUrl?: string;
  actorContributorId?: string;
  payload: Record<string, any>;
  timestamp: string;
  changeRequestLabelById?: Map<string, string>;
  onReviewClick?: (reviewId: string) => void;
  onArtifactClick?: (artifactId: string) => void;
  artifactIdByName?: Map<string, string>;
  artifactUrlByName?: Map<string, string>;
  isProjectTimeline?: boolean;
};

function ActorLeading({
  name,
  avatarUrl,
  contributorId,
  prominence = "default",
}: {
  name: string;
  avatarUrl?: string;
  contributorId?: string;
  prominence?: "default" | "high";
}) {
  const colourKey = (contributorId ?? name).trim() || name.trim() || "?";
  return (
    <Avatar
      size="sm"
      src={avatarUrl}
      name={name}
      contributorId={contributorId ?? colourKey}
      prominence={prominence}
      style={getAvatarInlineStyle(colourKey, {
        ring: prominence === "high",
      })}
    />
  );
}

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

function statusChangePill(
  status: string | null | undefined,
  reviewType?: string | null,
  openChangeRequestCount?: number,
): {
  label: string;
  color: "mushroom" | "green" | "brand" | "error" | "butter" | "blue";
  tooltip?: string;
} {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  const rt = String(reviewType ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  const rtNorm =
    rt === "comparison" ? "compare" : rt === "approval" ? "approve" : rt;

  if (normalized === "in-review") {
    return { label: "In Review", color: "butter" };
  }
  if (
    normalized === "changes-requested" ||
    normalized === "needs-changes" ||
    normalized === "changes-needed"
  ) {
    return { label: "Needs Changes", color: "brand" };
  }
  if (normalized === "approved" && rtNorm === "compare") {
    return { label: "DIRECTION APPROVED", color: "green" };
  }
  if (normalized === "approved") {
    return { label: "Approved", color: "green" };
  }
  if (normalized === "rejected" || normalized === "blocked") {
    return { label: "Rejected", color: "error" };
  }
  if (normalized === "feedback-submitted") {
    return { label: "Feedback Submitted", color: "blue" as const };
  }
  if (normalized === "complete" && rtNorm === "compare") {
    const hasOpen = (openChangeRequestCount ?? 0) > 0;
    return {
      label: "COMPLETE",
      color: hasOpen ? "brand" : "green",
      tooltip: hasOpen ? "Change requests remain open on this review" : undefined,
    };
  }
  if (normalized === "complete") {
    const hasOpen = (openChangeRequestCount ?? 0) > 0;
    return {
      label: "Complete",
      color: hasOpen ? "brand" : "green",
      tooltip: hasOpen ? "Change requests remain open" : undefined,
    };
  }
  if (normalized === "closed") {
    return { label: "Complete", color: "mushroom" };
  }
  return { label: "Updated", color: "mushroom" as const };
}

function reviewTimelineStatusPill(statusRaw: string) {
  const statusKey = normalizeReviewStatusKey(statusRaw);
  const label =
    STATUS_DISPLAY_LABELS[statusKey] ??
    statusKey.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (LEGACY_STATUS_PILL_STATUSES.has(statusKey as StatusPillStatus)) {
    return (
      <StatusPill
        status={statusKey as StatusPillStatus}
        label={label}
        size="sm"
        appearance="filled"
        prominence="default"
        labelTypography="body"
      />
    );
  }

  const pill = statusChangePill(statusRaw);
  return (
    <StatusPill
      label={pill.label}
      color={pill.color}
      size="sm"
      appearance="filled"
      prominence="default"
      labelTypography="body"
    />
  );
}

function StatusTransitionPill({
  status,
  reviewType,
  openChangeRequestCount,
}: {
  status: string | null | undefined;
  reviewType?: string | null;
  openChangeRequestCount?: number;
}) {
  const pill = statusChangePill(status, reviewType, openChangeRequestCount);
  const node = (
    <StatusPill
      label={pill.label}
      color={pill.color}
      appearance="filled"
      prominence="default"
      size="lg"
    />
  );
  if (pill.tooltip) {
    return (
      <Tooltip label={pill.tooltip} position="top">
        <span className="inline-flex shrink-0">{node}</span>
      </Tooltip>
    );
  }
  return node;
}

const LEGACY_STATUS_PILL_STATUSES = new Set<StatusPillStatus>([
  "draft",
  "in-review",
  "approved",
  "needs-changes",
  "blocked",
  "closed",
  "feedback-submitted",
  "paused",
]);

function manualStatusPillNode(
  statusRaw: string,
  reviewType?: string | null,
  openChangeRequestCount?: number,
) {
  const statusKey = normalizeReviewStatusKey(statusRaw);
  const label =
    STATUS_DISPLAY_LABELS[statusKey] ??
    statusKey.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (LEGACY_STATUS_PILL_STATUSES.has(statusKey as StatusPillStatus)) {
    return (
      <StatusPill
        status={statusKey as StatusPillStatus}
        label={label}
        size="lg"
        appearance="filled"
        prominence="default"
      />
    );
  }

  return (
    <StatusTransitionPill
      status={statusRaw}
      reviewType={reviewType}
      openChangeRequestCount={openChangeRequestCount}
    />
  );
}

function projectStatusLabel(raw: string): string {
  const status = raw.trim().toLowerCase();
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  if (status === "complete") return "Complete";
  return raw.trim() || "Updated";
}

function projectTimelineStatusPill(statusRaw: string) {
  const status = statusRaw.trim().toLowerCase();
  if (status === "active") {
    return (
      <StatusPill
        label="Active"
        status="approved"
        size="sm"
        appearance="filled"
        prominence="high"
        labelTypography="body"
      />
    );
  }
  if (status === "paused") {
    return (
      <StatusPill
        label="Paused"
        status="paused"
        size="sm"
        appearance="filled"
        prominence="high"
        labelTypography="body"
      />
    );
  }
  if (status === "complete") {
    return (
      <StatusPill
        label="Complete"
        status="closed"
        size="sm"
        appearance="filled"
        prominence="high"
        labelTypography="body"
      />
    );
  }
  return (
    <StatusPill
      label={projectStatusLabel(statusRaw)}
      status="draft"
      size="sm"
      appearance="filled"
      prominence="high"
      labelTypography="body"
    />
  );
}

const timelineArrowStyle = {
  color: "var(--text-tertiary, #998c82)",
  fontSize: 13,
  fontWeight: 500 as const,
};

function projectUpdatedFieldLabel(field: string): string {
  const normalized = field.trim().toLowerCase();
  if (normalized === "name") return "name";
  if (normalized === "description") return "description";
  if (normalized === "client") return "group";
  return field.trim() || "details";
}

function ManualStatusChangeEventRow({
  actor,
  actorLeading,
  timeLabel,
  timeTooltipLabel,
  statusRaw,
  reviewType,
  openChangeRequestCount,
}: {
  actor: string;
  actorLeading: ReactNode;
  timeLabel: string;
  timeTooltipLabel?: string;
  statusRaw: string;
  reviewType?: string | null;
  openChangeRequestCount?: number;
}) {
  const textSecondary = { color: "#998c82", fontSize: 13, fontWeight: 500 as const };
  const textPrimary = { color: "#2e1c1c", fontSize: 13, fontWeight: 500 as const };

  return (
    <EventRow
      leading={actorLeading}
      timeLabel={timeLabel}
      timeTooltipLabel={timeTooltipLabel}
    >
      <span className="min-w-0 truncate" style={textPrimary}>
        {actor}
      </span>
      <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
        changed the review status to
      </span>
      <span className="inline-flex shrink-0">
        {manualStatusPillNode(statusRaw, reviewType, openChangeRequestCount)}
      </span>
    </EventRow>
  );
}

const SENTIMENT = {
  meta: { bg: "#ffffff", border: "#ede8e0", dot: "#998c82" },
  upload: { bg: "#f3efe9", border: "#ede8e0", dot: "#998c82" },
  selection: { bg: "#fff6d7", border: "#c9c0b4", dot: "#e5c820" },
  approved: {
    bg: "var(--feedback-success-bg, #ebf6ee)",
    border: "var(--feedback-success-border, #7dc98f)",
    dot: "var(--feedback-success-border, #7dc98f)",
  },
  attention: { bg: "#ffffff", border: "#ede8e0", dot: "#e5c820" },
  // feedback/info — Compare "preferred option" selections.
  info: { bg: "#e5f3f9", border: "#6baed4", dot: "#2e82b5" },
  delete: { bg: "#fceaea", border: "#e07070", dot: "#e07070" }
} as const;

const EVENT_SENTIMENT: Record<TimelineEventType, keyof typeof SENTIMENT> = {
  project_created: "meta",
  problem_added: "meta",
  problem_edited: "meta",
  tradeoff_added: "meta",
  tradeoff_edited: "meta",
  teammate_added: "meta",
  review_created: "meta",
  artifact_uploaded: "upload",
  review_focus_edited: "meta",
  feedback_provided: "meta",
  changes_requested: "attention",
  change_requested: "attention",
  change_request_closed: "attention",
  concept_selected: "selection",
  review_approved: "approved",
  partial_approval: "approved",
  reviewer_added: "meta",
  reviewers_notified: "meta",
  status_changed: "attention",
  review_paused: "meta",
  review_reactivated: "info",
  decision_recorded: "selection",
  decision_made: "selection",
  review_deleted: "delete",
  artifact_deleted: "delete",
  artifact_description_edited: "meta",
  project_updated: "meta",
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

function ArtifactLink({
  text,
  artifactId,
  artifactUrl,
  onArtifactClick,
  className = ""
}: {
  text: string;
  artifactId?: string;
  artifactUrl?: string | null;
  onArtifactClick?: (artifactId: string) => void;
  className?: string;
}) {
  const linkStyle = {
    color: "#6b1e2e",
    fontSize: 13,
    fontWeight: 500
  };
  const truncate =
    "min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-left";
  const resolvedUrl = artifactUrl?.trim() || null;
  if (resolvedUrl) {
    return (
      <a
        href={resolvedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${truncate} ${className} hover:underline`}
        style={{ ...linkStyle, cursor: "pointer", textDecoration: "none" }}
      >
        {text}
      </a>
    );
  }
  if (!artifactId || !onArtifactClick) {
    return <span className={`${truncate} ${className}`} style={linkStyle}>{text}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onArtifactClick(artifactId)}
      className={`border-0 bg-transparent p-0 hover:underline ${truncate} ${className}`}
      style={{ ...linkStyle, cursor: "pointer" }}
    >
      {text}
    </button>
  );
}

function ReviewersNotifiedRecipients({
  payload,
  textSecondary,
}: {
  payload: Record<string, unknown>;
  textSecondary: { color: string; fontSize: number; fontWeight: 500 };
}) {
  const trigger = String(payload.trigger ?? "")
    .trim()
    .toLowerCase();
  const isReminder = trigger === "reminder";
  const isPublishLike = trigger === "publish" || trigger === "reviewer_added";
  const verbPhrase = isReminder ? "sent a reminder to" : "notified";
  const suffixPhrase = isPublishLike ? "about this review" : null;

  const names = Array.isArray(payload.recipient_names)
    ? payload.recipient_names.map((name) => String(name).trim()).filter(Boolean)
    : [];
  const count =
    typeof payload.recipient_count === "number" ? payload.recipient_count : names.length;
  const nameStyle = { color: "#6b1e2e", fontSize: 13, fontWeight: 500 as const };

  let recipientNode: ReactNode;
  if (count === 1 && names[0]) {
    recipientNode = (
      <span className="min-w-0 truncate" style={nameStyle}>
        {names[0]}
      </span>
    );
  } else if (count === 2 && names.length >= 2) {
    recipientNode = (
      <>
        <span className="min-w-0 truncate" style={nameStyle}>
          {names[0]}
        </span>
        <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
          and
        </span>
        <span className="min-w-0 truncate" style={nameStyle}>
          {names[1]}
        </span>
      </>
    );
  } else {
    const label = `${count} reviewers`;
    const tooltipNames = names.length > 0 ? names.join("\n") : label;
    recipientNode = (
      <Tooltip label={tooltipNames} position="top" maxWidth={240}>
        <span
          className="inline-flex shrink-0 cursor-default whitespace-nowrap hover:underline"
          style={nameStyle}
        >
          {label}
        </span>
      </Tooltip>
    );
  }

  return (
    <>
      <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
        {verbPhrase}
      </span>
      {recipientNode}
      {suffixPhrase ? (
        <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
          {suffixPhrase}
        </span>
      ) : null}
    </>
  );
}

function EventRow({
  leading,
  children,
  timeLabel,
  timeTooltipLabel,
}: {
  leading?: React.ReactNode;
  children: ReactNode;
  timeLabel: string;
  timeTooltipLabel?: string;
}) {
  const timeNode = (
    <span className="shrink-0 whitespace-nowrap text-[12px]" style={{ color: "#6b5e55" }}>
      {timeLabel}
    </span>
  );
  return (
    <div className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2">
      {leading != null ? <span className="shrink-0">{leading}</span> : null}
      <div className="flex min-w-0 min-h-0 flex-1 flex-nowrap items-center gap-2 overflow-hidden">
        {children}
      </div>
      {timeTooltipLabel ? (
        <Tooltip label={timeTooltipLabel} position="top">
          {timeNode}
        </Tooltip>
      ) : (
        timeNode
      )}
    </div>
  );
}

function feedbackProvidedPalette(payload: Record<string, any>): (typeof SENTIMENT)[keyof typeof SENTIMENT] {
  const kind = String(payload.feedback_kind ?? "").trim().toLowerCase();
  if (kind === "changes") return SENTIMENT.attention;
  if (kind === "approval" || kind === "mixed") return SENTIMENT.approved;
  const summary = String(payload.activity_summary ?? "").toLowerCase();
  if (summary.includes("requested changes")) return SENTIMENT.attention;
  if (summary.includes("approved")) return SENTIMENT.approved;
  return SENTIMENT.meta;
}

export function TimelineEventCard({
  eventType,
  actorName,
  actorAvatarUrl,
  actorContributorId,
  payload,
  timestamp,
  changeRequestLabelById,
  onReviewClick,
  onArtifactClick,
  artifactIdByName,
  artifactUrlByName,
  isProjectTimeline = false
}: TimelineEventCardProps) {
  const normalizedEventType = String(eventType)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_") as TimelineEventType;
  const selectionStage = String(payload.selection_stage ?? "").trim().toLowerCase();
  const reviewType = String(payload.review_type ?? "").trim().toLowerCase();
  const conceptSelected = normalizedEventType === "concept_selected";
  const previousConceptName = String(
    payload.previous_concept_name ?? payload.previousConceptName ?? "",
  ).trim();
  const isPreferenceUpdate =
    conceptSelected &&
    previousConceptName.length > 0 &&
    selectionStage === "preference";
  const isDirectionUpdate =
    conceptSelected &&
    previousConceptName.length > 0 &&
    selectionStage === "direction_update";
  const isPreferredOptionCard =
    normalizedEventType === "concept_selected" && selectionStage === "preference";
  const isCompareReview =
    reviewType === "compare" || reviewType === "comparison";
  const isApprovedDirectionCard =
    normalizedEventType === "concept_selected" &&
    selectionStage === "approved_direction";
  const usesCompareApprovedDirectionPalette =
    isCompareReview && (isApprovedDirectionCard || isDirectionUpdate);
  const palette =
    normalizedEventType === "feedback_provided"
      ? feedbackProvidedPalette(payload)
      : usesCompareApprovedDirectionPalette
        ? SENTIMENT.approved
        : isPreferredOptionCard
          ? SENTIMENT.info
          : SENTIMENT[EVENT_SENTIMENT[normalizedEventType] ?? "meta"];
  const actor = actorName?.trim() || "A team member";
  const reviewId = String(payload.review_id ?? "");
  const t = formatTimelineTimestamp(timestamp);
  const timeTooltipLabel = shouldShowTimelineTimestampTooltip(timestamp)
    ? formatTimelineTimestampTooltip(timestamp)
    : "";
  const textSecondary = { color: "#998c82", fontSize: 13, fontWeight: 500 as const };
  const textPrimary = { color: "#2e1c1c", fontSize: 13, fontWeight: 500 as const };
  const eventTooltipText = String(
    payload.tooltip_text ??
      payload.problem_text ??
      payload.tradeoff_text ??
      ""
  ).trim();
  const renderTooltipText = (label: string, className = "shrink-0 whitespace-nowrap") =>
    eventTooltipText ? (
      <Tooltip label={eventTooltipText} position="top" maxWidth={240}>
        <span className={className} style={textSecondary}>
          {label}
        </span>
      </Tooltip>
    ) : (
      <span className={className} style={textSecondary}>
        {label}
      </span>
    );

  const created = normalizedEventType === "review_created";
  const uploaded = normalizedEventType === "artifact_uploaded";
  const projectCreated = normalizedEventType === "project_created";
  const rawConceptName = String(
    payload.concept_name ?? payload.conceptName ?? payload.concept ?? ""
  );
  const conceptName =
    rawConceptName.trim().toLowerCase() === "selected concept"
      ? "Concept B"
      : rawConceptName;
  const conceptSuffix = (() => {
    if (selectionStage === "approved_direction") return "as the approved direction";
    if (selectionStage === "direction_update") return "";
    if (
      selectionStage === "preference" ||
      reviewType === "comparison" ||
      reviewType === "compare"
    ) {
      return "as their preferred option";
    }
    return "as the final direction";
  })();
  const reviewTitle = String(
    payload.reviewTitle ?? payload.review_title ?? "Review",
  );
  const artifactName = String(payload.artifact_name ?? "");
  const usesColouredCardBackground = palette.bg !== "#ffffff";
  const actorLeading = (
    <ActorLeading
      name={actor}
      avatarUrl={actorAvatarUrl}
      contributorId={actorContributorId}
      prominence={usesColouredCardBackground ? "high" : "default"}
    />
  );
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
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
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
              <StatusPill {...reviewPill(String(payload.review_status ?? "draft"))} size="lg" />
            </span>
          </EventRow>
        ) : projectCreated ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
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
            {timeTooltipLabel ? (
              <Tooltip label={timeTooltipLabel} position="top">
                <span className="shrink-0 whitespace-nowrap text-[12px]" style={{ color: "#6b5e55" }}>
                  {t}
                </span>
              </Tooltip>
            ) : (
              <span className="shrink-0 whitespace-nowrap text-[12px]" style={{ color: "#6b5e55" }}>
                {t}
              </span>
            )}
          </div>
        ) : isDirectionUpdate ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              updated the approved direction from
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textPrimary}>
              {previousConceptName}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              to
            </span>
            <span
              className="shrink-0 whitespace-nowrap"
              style={{ color: "#6b1e2e", fontSize: 13, fontWeight: 500 }}
            >
              {conceptName}
            </span>
          </EventRow>
        ) : isPreferenceUpdate ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              updated their concept preference from
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textPrimary}>
              {previousConceptName}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              to
            </span>
            <ReviewLink
              text={conceptName}
              reviewId={reviewId}
              onReviewClick={onReviewClick}
            />
            {isProjectTimeline && reviewId ? (
              <>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  on
                </span>
                <ReviewLink text={reviewTitle} reviewId={reviewId} onReviewClick={onReviewClick} />
              </>
            ) : null}
          </EventRow>
        ) : isApprovedDirectionCard ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              {' selected '}
            </span>
            <span
              className="shrink-0 whitespace-nowrap"
              style={{ color: '#6b1e2e', fontSize: 13, fontWeight: 500 }}
            >
              {conceptName}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              {' as the approved direction on '}
            </span>
            <ReviewLink
              text={reviewTitle}
              reviewId={reviewId}
              onReviewClick={onReviewClick}
            />
          </EventRow>
        ) : conceptSelected ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              {isPreferredOptionCard ? ' selected ' : 'selected'}
            </span>
            {isPreferredOptionCard ? (
              <span
                className="shrink-0 whitespace-nowrap"
                style={{ color: '#6b1e2e', fontSize: 13, fontWeight: 500 }}
              >
                {conceptName}
              </span>
            ) : (
              <ReviewLink
                text={conceptName}
                reviewId={reviewId}
                onReviewClick={onReviewClick}
              />
            )}
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
          (() => {
            const approvedArtifactName = String(payload.artifact_name ?? "").trim();
            const approvedArtifactId = String(payload.artifact_id ?? "").trim();
            const onBehalfOfName = String(payload.on_behalf_of_name ?? "").trim();
            const approvedNames = Array.isArray(payload.approved_artifact_names)
              ? payload.approved_artifact_names.map((name) => String(name).trim()).filter(Boolean)
              : approvedArtifactName
                ? [approvedArtifactName]
                : [];
            const changeNames = Array.isArray(payload.change_artifact_names)
              ? payload.change_artifact_names.map((name) => String(name).trim()).filter(Boolean)
              : [];
            const hasStructuredNames = approvedNames.length > 0 || changeNames.length > 0;

            if (hasStructuredNames) {
              return (
                <EventRow
                  leading={actorLeading}
                  timeLabel={t}
                  timeTooltipLabel={timeTooltipLabel || undefined}
                >
                  <span className="min-w-0 truncate" style={textPrimary}>
                    {actor}
                  </span>
                  {approvedNames.length > 0 ? (
                    <>
                      <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                        approved
                      </span>
                      <ArtifactLink
                        text={approvedNames[0]}
                        artifactId={approvedArtifactId || artifactIdByName?.get(approvedNames[0])}
                        onArtifactClick={onArtifactClick}
                      />
                    </>
                  ) : null}
                  {changeNames.length > 0 ? (
                    <>
                      <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                        {approvedNames.length > 0 ? "and requested changes on" : "requested changes on"}
                      </span>
                      <ArtifactLink
                        text={changeNames[0]}
                        artifactId={artifactIdByName?.get(changeNames[0])}
                        onArtifactClick={onArtifactClick}
                      />
                    </>
                  ) : null}
                  {onBehalfOfName ? (
                    <>
                      <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                        on behalf of
                      </span>
                      <span className="shrink-0 whitespace-nowrap" style={textPrimary}>
                        {onBehalfOfName}
                      </span>
                    </>
                  ) : null}
                </EventRow>
              );
            }

            return (
              <EventRow
                leading={actorLeading}
                timeLabel={t}
                timeTooltipLabel={timeTooltipLabel || undefined}
              >
                {typeof payload.activity_summary === "string" &&
                payload.activity_summary.trim() ? (
                  <span className="min-w-0 truncate" style={textPrimary}>
                    {String(payload.activity_summary).trim()}
                  </span>
                ) : (
                  <>
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
                    {String(payload.on_behalf_of_name ?? "").trim() ? (
                      <>
                        <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                          on behalf of
                        </span>
                        <span className="shrink-0 whitespace-nowrap" style={textPrimary}>
                          {String(payload.on_behalf_of_name).trim()}
                        </span>
                      </>
                    ) : null}
                  </>
                )}
              </EventRow>
            );
          })()
        ) : normalizedEventType === "change_requested" ? (
          (() => {
            const changeLabel = resolveChangeRequestTagLabel(payload, changeRequestLabelById);
            const artifactName = String(payload.artifact_name ?? "").trim();
            const artifactId = String(payload.artifact_id ?? "").trim();
            const onBehalfOfName = String(payload.on_behalf_of_name ?? "").trim();
            const reopened = payload.reopened === true;
            return (
              <EventRow
                leading={actorLeading}
                timeLabel={t}
                timeTooltipLabel={timeTooltipLabel || undefined}
              >
                <span className="min-w-0 truncate" style={textPrimary}>
                  {actor}
                </span>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  {reopened ? "reopened change request" : "requested"}
                </span>
                {reopened && changeLabel ? (
                  <span className="shrink-0">
                    <Tag label={changeLabel} variant="butter" size="sm" />
                  </span>
                ) : null}
                {reopened ? (
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
                {artifactName && !reopened ? (
                  <>
                    <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                      changes on
                    </span>
                    <ArtifactLink
                      text={artifactName}
                      artifactId={artifactId || artifactIdByName?.get(artifactName)}
                      artifactUrl={artifactUrlByName?.get(artifactName)}
                      onArtifactClick={onArtifactClick}
                    />
                    {changeLabel ? (
                      <span className="shrink-0">
                        <Tag label={changeLabel} variant="butter" size="sm" />
                      </span>
                    ) : null}
                  </>
                ) : changeLabel && !reopened ? (
                  <span className="shrink-0">
                    <Tag label={changeLabel} variant="butter" size="sm" />
                  </span>
                ) : reopened && changeLabel ? (
                  <span className="shrink-0">
                    <Tag label={changeLabel} variant="butter" size="sm" />
                  </span>
                ) : null}
                {onBehalfOfName ? (
                  <>
                    <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                      on behalf of
                    </span>
                    <span className="shrink-0 whitespace-nowrap" style={textPrimary}>
                      {onBehalfOfName}
                    </span>
                  </>
                ) : null}
              </EventRow>
            );
          })()
        ) : normalizedEventType === "change_request_closed" ? (
          (() => {
            const changeNumber = String(payload.change_number ?? "").trim();
            const changeLabel = changeNumber
              ? `Change ${changeNumber}`
              : resolveChangeRequestTagLabel(payload, changeRequestLabelById);
            return (
              <EventRow
                leading={actorLeading}
                timeLabel={t}
                timeTooltipLabel={timeTooltipLabel || undefined}
              >
                <span className="min-w-0 truncate" style={textPrimary}>
                  {actor}
                </span>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  resolved change request
                </span>
                {changeLabel ? (
                  <span className="shrink-0">
                    <Tag label={changeLabel} variant="butter" size="sm" />
                  </span>
                ) : null}
              </EventRow>
            );
          })()
        ) : normalizedEventType === "changes_requested" ? (
          (() => {
            const changeLabel = resolveChangeRequestTagLabel(payload, changeRequestLabelById);
            const activitySummary =
              typeof payload.activity_summary === "string"
                ? payload.activity_summary.trim()
                : "";
            const hasNumberedPhrase =
              Boolean(changeLabel) && activitySummary.length > 0;

            if (hasNumberedPhrase) {
              return (
                <EventRow
                  leading={actorLeading}
                  timeLabel={t}
                  timeTooltipLabel={timeTooltipLabel || undefined}
                >
                  <span className="min-w-0 truncate" style={textPrimary}>
                    {actor}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    {activitySummary.replace(/Change\s*#?\s*[\d.]+/i, "").trim() || "requested changes"}
                  </span>
                  {changeLabel ? (
                    <span className="shrink-0">
                      <Tag label={changeLabel} variant="butter" size="sm" />
                    </span>
                  ) : null}
                </EventRow>
              );
            }

            return (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              requested changes
            </span>
            {changeLabel ? (
              <span className="shrink-0">
                <Tag label={changeLabel} variant="butter" size="sm" />
              </span>
            ) : null}
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
            );
          })()
        ) : normalizedEventType === "review_paused" ? (
          <ManualStatusChangeEventRow
            actor={actor}
            actorLeading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
            statusRaw="paused"
          />
        ) : normalizedEventType === "review_reactivated" ? (
          <ManualStatusChangeEventRow
            actor={actor}
            actorLeading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
            statusRaw="in-review"
          />
        ) : normalizedEventType === "project_updated" ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              updated
            </span>
            <span className="min-w-0 truncate" style={textSecondary}>
              {projectUpdatedFieldLabel(String(payload.field ?? "details"))}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              on this project
            </span>
          </EventRow>
        ) : normalizedEventType === "status_changed" ? (
          (() => {
            const entity = String(payload.entity ?? "")
              .trim()
              .toLowerCase();
            if (entity === "project") {
              const newStatusRaw = String(
                payload.new_status ?? payload.to_status ?? payload.to ?? "",
              ).trim();
              return (
                <EventRow
                  leading={actorLeading}
                  timeLabel={t}
                  timeTooltipLabel={timeTooltipLabel || undefined}
                >
                  <span className="min-w-0 truncate" style={textPrimary}>
                    {actor}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    changed the project status to
                  </span>
                  <span className="inline-flex shrink-0">
                    {projectTimelineStatusPill(newStatusRaw)}
                  </span>
                </EventRow>
              );
            }
            if (entity === "review") {
              const previousStatusRaw = String(
                payload.from ?? payload.previous_status ?? payload.from_status ?? "",
              ).trim();
              const newStatusRaw = String(
                payload.to ?? payload.new_status ?? payload.to_status ?? "",
              ).trim();
              const eventReviewTitle =
                String(payload.reviewTitle ?? payload.review_title ?? reviewTitle).trim() ||
                "Review";
              const eventReviewId = String(
                payload.reviewId ?? reviewId ?? "",
              ).trim();

              return (
                <EventRow
                  leading={actorLeading}
                  timeLabel={t}
                  timeTooltipLabel={timeTooltipLabel || undefined}
                >
                  <span className="min-w-0 truncate" style={textPrimary}>
                    {actor}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    triggered
                  </span>
                  <ReviewLink
                    text={eventReviewTitle}
                    reviewId={eventReviewId || undefined}
                    onReviewClick={onReviewClick}
                  />
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    status to change from
                  </span>
                  <span className="inline-flex shrink-0">
                    {reviewTimelineStatusPill(previousStatusRaw)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={timelineArrowStyle}>
                    →
                  </span>
                  <span className="inline-flex shrink-0">
                    {reviewTimelineStatusPill(newStatusRaw)}
                  </span>
                </EventRow>
              );
            }
            if (Boolean(payload.review_reopened)) {
              return (
                <EventRow
                  leading={actorLeading}
                  timeLabel={t}
                  timeTooltipLabel={timeTooltipLabel || undefined}
                >
                  <span className="min-w-0 truncate" style={textPrimary}>
                    {actor}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    reopened this review.
                  </span>
                </EventRow>
              );
            }
            const previousStatusRaw = String(
              payload.from ??
                payload.previous_status ??
                payload.from_status ??
                "",
            ).trim();
            const newStatusRaw = String(
              payload.to ?? payload.new_status ?? payload.to_status ?? "",
            ).trim();
            const eventReviewType = String(
              payload.review_type ?? reviewType ?? "",
            ).trim();
            const openChangeRequestCount = Number(
              payload.open_change_request_count ?? 0,
            );
            const statusTrigger = String(
              payload.status_transition_trigger ?? payload.trigger ?? "auto",
            )
              .trim()
              .toLowerCase();
            const isManualStatusChange = statusTrigger === "manual";
            if (isManualStatusChange && newStatusRaw) {
              return (
                <ManualStatusChangeEventRow
                  actor={actor}
                  actorLeading={actorLeading}
                  timeLabel={t}
                  timeTooltipLabel={timeTooltipLabel || undefined}
                  statusRaw={newStatusRaw}
                  reviewType={eventReviewType}
                  openChangeRequestCount={openChangeRequestCount}
                />
              );
            }
            const previousStatus = previousStatusRaw
              ? statusChangePill(
                  previousStatusRaw,
                  eventReviewType,
                  openChangeRequestCount,
                )
              : null;

            return (
              <EventRow
                leading={actorLeading}
                timeLabel={t}
                timeTooltipLabel={timeTooltipLabel || undefined}
              >
                <span className="min-w-0 truncate" style={textPrimary}>
                  {actor}
                </span>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  {isManualStatusChange ? "progressed" : "triggered"}
                </span>
                <ReviewLink
                  text={reviewTitle}
                  reviewId={reviewId}
                  onReviewClick={onReviewClick}
                />
                {previousStatus ? (
                  <>
                    <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                      {isManualStatusChange ? "status from" : "status to change from"}
                    </span>
                    <span className="inline-flex shrink-0">
                      {reviewTimelineStatusPill(previousStatusRaw)}
                    </span>
                    <span className="shrink-0 whitespace-nowrap" style={timelineArrowStyle}>
                      →
                    </span>
                    <span className="inline-flex shrink-0">
                      {reviewTimelineStatusPill(newStatusRaw)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                      status updated to
                    </span>
                    <StatusTransitionPill
                      status={newStatusRaw}
                      reviewType={eventReviewType}
                      openChangeRequestCount={openChangeRequestCount}
                    />
                  </>
                )}
              </EventRow>
            );
          })()
        ) : normalizedEventType === "review_approved" ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
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
          (() => {
            const editTarget = String(payload.edit_target ?? "").trim();
            const previousTitle = String(payload.previous_title ?? "").trim();
            const newTitle = String(payload.new_title ?? "").trim();
            const isTitleChange =
              editTarget === "Review title" && previousTitle.length > 0 && newTitle.length > 0;

            if (isTitleChange) {
              return (
                <EventRow
                  leading={actorLeading}
                  timeLabel={t}
                  timeTooltipLabel={timeTooltipLabel || undefined}
                >
                  <span className="min-w-0 truncate" style={textPrimary}>
                    {actor}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    changed the review title from
                  </span>
                  <span className="min-w-0 truncate" style={textSecondary}>
                    {previousTitle}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    to
                  </span>
                  <span className="min-w-0 truncate" style={textSecondary}>
                    {newTitle}
                  </span>
                </EventRow>
              );
            }

            return (
              <EventRow
                leading={actorLeading}
                timeLabel={t}
                timeTooltipLabel={timeTooltipLabel || undefined}
              >
                <span className="min-w-0 truncate" style={textPrimary}>
                  {actor}
                </span>
                {renderTooltipText("edited")}
                <ReviewLink
                  text={String(payload.edit_target ?? "Review Details")}
                  reviewId={reviewId}
                  onReviewClick={onReviewClick}
                />
              </EventRow>
            );
          })()
        ) : normalizedEventType === "problem_added" ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            {renderTooltipText("added a problem")}
          </EventRow>
        ) : normalizedEventType === "problem_edited" ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            {renderTooltipText("edited a problem")}
          </EventRow>
        ) : normalizedEventType === "tradeoff_added" ? (
          <EventRow

            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            {renderTooltipText(
              `added a ${String(payload.tradeoff_severity ?? "High")} priority tradeoff`
            )}
          </EventRow>
        ) : normalizedEventType === "tradeoff_edited" ? (
          <EventRow

            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            {renderTooltipText("edited a tradeoff")}
          </EventRow>
        ) : normalizedEventType === "artifact_deleted" ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              removed artifact
            </span>
            <span
              className="min-w-0 truncate"
              style={{ color: "#6b1e2e", fontSize: 13, fontWeight: 500 }}
            >
              &ldquo;{String(payload.artifact_title ?? "Artifact")}&rdquo;
            </span>
            <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
              from
            </span>
            <ReviewLink text={reviewTitle} reviewId={reviewId} onReviewClick={onReviewClick} />
            {typeof payload.artifact_url === "string" && payload.artifact_url.trim() ? (
              <>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  (
                </span>
                <a
                  href={String(payload.artifact_url).trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate hover:underline"
                  style={{ color: "#6b1e2e", fontSize: 13, fontWeight: 500 }}
                >
                  {String(payload.artifact_url).trim()}
                </a>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  )
                </span>
              </>
            ) : null}
          </EventRow>
        ) : normalizedEventType === "artifact_description_edited" ? (
          (() => {
            const changeType = String(payload.change_type ?? "")
              .trim()
              .toLowerCase();
            const actorName = String(payload.actor_name ?? actor).trim() || actor;
            const artifactTitle = String(payload.artifact_title ?? "Artifact");
            const emphasisStyle = { color: "#6b1e2e", fontSize: 13, fontWeight: 500 };

            if (changeType === "title") {
              const previousTitle = String(payload.previous_title ?? "Artifact");
              return (
                <EventRow
                  leading={actorLeading}
                  timeLabel={t}
                  timeTooltipLabel={timeTooltipLabel || undefined}
                >
                  <span className="min-w-0 truncate" style={textPrimary}>
                    {actorName}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    renamed
                  </span>
                  <span className="min-w-0 truncate" style={emphasisStyle}>
                    {previousTitle}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    to
                  </span>
                  <span className="min-w-0 truncate" style={emphasisStyle}>
                    {artifactTitle}
                  </span>
                </EventRow>
              );
            }

            if (changeType === "version") {
              const previousVersion = String(payload.previous_version ?? "v1");
              const newVersion = String(payload.new_version ?? "v1");
              return (
                <EventRow
                  leading={actorLeading}
                  timeLabel={t}
                  timeTooltipLabel={timeTooltipLabel || undefined}
                >
                  <span className="min-w-0 truncate" style={textPrimary}>
                    {actorName}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    updated
                  </span>
                  <span className="min-w-0 truncate" style={emphasisStyle}>
                    {artifactTitle}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    from
                  </span>
                  <span className="min-w-0 truncate" style={emphasisStyle}>
                    {previousVersion}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    to
                  </span>
                  <span className="min-w-0 truncate" style={emphasisStyle}>
                    {newVersion}
                  </span>
                </EventRow>
              );
            }

            if (changeType === "description") {
              return (
                <EventRow
                  leading={actorLeading}
                  timeLabel={t}
                  timeTooltipLabel={timeTooltipLabel || undefined}
                >
                  <span className="min-w-0 truncate" style={textPrimary}>
                    {actorName}
                  </span>
                  <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                    updated the description for
                  </span>
                  <span className="min-w-0 truncate" style={emphasisStyle}>
                    {artifactTitle}
                  </span>
                </EventRow>
              );
            }

            return (
              <EventRow
                leading={actorLeading}
                timeLabel={t}
                timeTooltipLabel={timeTooltipLabel || undefined}
              >
                <span className="min-w-0 truncate" style={textPrimary}>
                  {actorName}
                </span>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  updated
                </span>
                <span className="min-w-0 truncate" style={emphasisStyle}>
                  {artifactTitle}
                </span>
              </EventRow>
            );
          })()
        ) : normalizedEventType === "reviewers_notified" ? (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            <ReviewersNotifiedRecipients payload={payload} textSecondary={textSecondary} />
          </EventRow>
        ) : normalizedEventType === "reviewer_added" ? (
          <EventRow

            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
          >
            <span className="min-w-0 truncate" style={textPrimary}>
              {actor}
            </span>
            {Boolean(payload.auto_approved_after_removal) ? (
              <>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  This review was automatically approved after
                </span>
                <span
                  className="min-w-0 truncate"
                  style={{ color: "#6b1e2e", fontSize: 13, fontWeight: 500 }}
                >
                  {String(payload.reviewer_name ?? "Reviewer")}
                </span>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  was removed. All remaining reviewers had previously approved.
                </span>
              </>
            ) : Boolean(payload.reviewer_removed) ? (
              <>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  removed
                </span>
                <span
                  className="min-w-0 truncate"
                  style={{ color: "#6b1e2e", fontSize: 13, fontWeight: 500 }}
                >
                  {String(payload.reviewer_name ?? "Reviewer")}
                </span>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  as a reviewer.
                </span>
              </>
            ) : Boolean(payload.reopened_after_adding) ? (
              <>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  re-opened
                </span>
                <ReviewLink text="this review" reviewId={reviewId} onReviewClick={onReviewClick} />
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  after adding
                </span>
                <span
                  className="min-w-0 truncate"
                  style={{ color: "#6b1e2e", fontSize: 13, fontWeight: 500 }}
                >
                  {String(payload.reviewer_name ?? "Reviewer")}
                </span>
                <span className="shrink-0 whitespace-nowrap" style={textSecondary}>
                  {Number(payload.reviewer_count ?? 1) === 1 ? "as a reviewer." : "as reviewers."}
                </span>
              </>
            ) : (
              <>
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
              </>
            )}
          </EventRow>
        ) : (
          <EventRow
            leading={actorLeading}
            timeLabel={t}
            timeTooltipLabel={timeTooltipLabel || undefined}
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
