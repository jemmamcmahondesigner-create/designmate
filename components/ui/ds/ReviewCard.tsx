'use client';

import { Avatar } from './Avatar';
import { Tag } from './Tag';
import { StatusPill, type StatusPillColor } from './StatusPill';
import styles from './ReviewCard.module.css';

export type ReviewStatus =
  | 'draft'
  | 'in-review'
  | 'feedback-submitted'
  | 'paused'
  | 'complete'
  | 'approved'
  | 'needs-changes'
  | 'changes-needed'
  | 'blocked';

export interface ReviewCardProps {
  title: string;
  /** Review lifecycle `reviews.status` (DB-normalized). */
  status: ReviewStatus;
  /** `reviews.decision_status` — drives Complete pill colour. */
  decisionStatus?: string | null;
  /** `reviews.require_decision_maker` — Complete + no decision → mushroom when false. */
  requireDecisionMaker?: boolean;
  /**
   * Review creator (submitter) — shown on the meta avatar.
   * Prefer `creatorName`; `ownerName` must be the same person (`reviews.owner_display_name`), not the decision maker.
   */
  creatorName?: string;
  creatorAvatarSrc?: string;
  /** Review creator display name when `creatorName` is not passed (not the decision maker). */
  ownerName?: string;
  /** @deprecated Use `creatorAvatarSrc`. */
  ownerAvatarSrc?: string;
  dateLabel?: string;
  /** Client / project name — butter Tag below status row (DLS 55:108). */
  clientName?: string;
  description?: string;
  /** Show the description body */
  showDescription?: boolean;
  /** Show the artifact attachment row */
  hasArtifact?: boolean;
  artifactLabel?: string;
  /** Version chip rendered right-aligned in the footer (e.g. "v1") */
  iterationLabel?: string;
  commentCount?: number;
  decisionCount?: number;
  /** When false, the footer (counts + iteration) is hidden */
  showDetailCounts?: boolean;
  onClick?: () => void;
  className?: string;
}

function norm(s: string | null | undefined) {
  return String(s ?? '').trim().toLowerCase();
}

/** Same semantics as Review Detail `completeLifecyclePillColor`. */
function completeLifecyclePillColor(decisionStatus: string | null | undefined): StatusPillColor {
  const d = norm(decisionStatus);
  if (!d) return 'mushroom';
  if (d === 'approved') return 'green';
  if (d === 'rejected' || d === 'blocked') return 'error';
  if (d === 'needs-changes' || d === 'changes-needed') return 'brand';
  return 'mushroom';
}

function reviewCardPill(input: {
  status: string;
  decisionStatus?: string | null;
  requireDecisionMaker?: boolean;
}): { color: StatusPillColor; label: string } {
  const k = norm(input.status);
  if (k === 'draft') return { color: 'mushroom', label: 'Draft' };
  if (k === 'in-review') return { color: 'butter', label: 'In Review' };
  if (k === 'feedback-submitted') return { color: 'blue', label: 'Feedback Submitted' };
  if (k === 'paused') return { color: 'mushroom', label: 'Paused' };
  if (k === 'complete' || k === 'approved' || k === 'needs-changes' || k === 'changes-needed') {
    return {
      label: 'Complete',
      color: completeLifecyclePillColor(input.decisionStatus),
    };
  }
  if (k === 'blocked') return { color: 'error', label: 'Blocked' };
  return { color: 'mushroom', label: 'Draft' };
}

export function ReviewCard({
  title,
  status,
  decisionStatus = null,
  requireDecisionMaker = true,
  creatorName,
  creatorAvatarSrc,
  ownerName,
  ownerAvatarSrc,
  dateLabel,
  clientName,
  description,
  showDescription = true,
  hasArtifact = false,
  artifactLabel,
  iterationLabel,
  commentCount,
  decisionCount,
  showDetailCounts = true,
  onClick,
  className,
}: ReviewCardProps) {
  const pill = reviewCardPill({ status, decisionStatus, requireDecisionMaker });
  const isNeedsChanges = status === 'needs-changes';
  /** Avatar always reflects the review creator (submitter), never reviewers[0] / decision maker. */
  const metaName = creatorName ?? ownerName;
  const metaAvatarSrc = creatorAvatarSrc ?? ownerAvatarSrc;

  const rootClass = [
    styles.root,
    isNeedsChanges ? styles['status-needs-changes'] : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const titleClass = [
    styles.title,
    isNeedsChanges ? styles.titleWarning : '',
  ]
    .filter(Boolean)
    .join(' ');

  const dividerClass = [
    styles.divider,
    isNeedsChanges ? styles.dividerStrong : '',
  ]
    .filter(Boolean)
    .join(' ');

  const countsClass = [
    styles.counts,
    isNeedsChanges ? styles.countsWarning : '',
  ]
    .filter(Boolean)
    .join(' ');

  const artifactClass = [
    styles.artifact,
    isNeedsChanges ? styles.artifactLight : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={rootClass}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {/* Title */}
      <h3 className={titleClass}>{title}</h3>

      {/* Status row */}
      <div className={styles.meta}>
        <StatusPill
          color={pill.color}
          appearance="filled"
          label={pill.label}
          size="sm"
        />
        {(metaName || metaAvatarSrc) && (
          <Avatar
            src={metaAvatarSrc}
            name={metaName?.trim() || undefined}
            size="md"
          />
        )}
        {dateLabel && (
          <span className={styles.date}>{dateLabel}</span>
        )}
      </div>

      {clientName ? (
        <div className={styles.clientTagRow}>
          <Tag label={clientName} variant="butter" size="sm" />
        </div>
      ) : null}

      {/* Description */}
      {showDescription && description && (
        <p className={styles.description}>{description}</p>
      )}

      {/* Artifact */}
      {hasArtifact && (
        <div className={artifactClass}>
          <span className={styles.artifactText}>
            📎&nbsp;&nbsp;{artifactLabel ?? 'Figma artifact attached'}
          </span>
        </div>
      )}

      {/* Footer: counts on the left, iteration tag right-aligned */}
      {showDetailCounts &&
        (commentCount !== undefined ||
          decisionCount !== undefined ||
          iterationLabel) && (
        <>
          <span className={dividerClass} />
          <div className={countsClass}>
            {commentCount !== undefined && (
              <span>{commentCount} {commentCount === 1 ? 'comment' : 'comments'}</span>
            )}
            {decisionCount !== undefined && (
              <span>{decisionCount} {decisionCount === 1 ? 'decision' : 'decisions'}</span>
            )}
            {iterationLabel && (
              <span className={styles.iterationSlot}>
                <Tag label={iterationLabel} variant="default" size="sm" />
              </span>
            )}
          </div>
        </>
      )}
    </article>
  );
}
