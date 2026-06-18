'use client';

import { Avatar } from './Avatar';
import { Tag } from './Tag';
import { StatusPill, type StatusPillColor } from './StatusPill';
import { Tooltip } from './Tooltip';
import { TruncatedTooltip } from './TruncatedTooltip';
import { Breadcrumb, type BreadcrumbSegment } from './Breadcrumb';
import {
  normalizeReviewTypeKey,
  resolveReviewStatusPill,
} from '@/lib/reviews/reviewStatusDisplay';
import { Warning } from 'phosphor-react';
import { getAvatarInlineStyle, avatarColourKey } from '@/lib/utils/avatarColour';
import styles from './ReviewCard.module.css';

export type ReviewStatus =
  | 'draft'
  | 'in-review'
  | 'feedback-submitted'
  | 'paused'
  | 'complete'
  | 'approved'
  | 'direction-approved'
  | 'needs-changes'
  | 'changes-needed'
  | 'blocked'
  | 'archived';

export interface ReviewCardProps {
  title: string;
  /** Review lifecycle `reviews.status` (DB-normalized). */
  status: ReviewStatus;
  /** Compare | approve | align | critique — drives type-specific pill labels. */
  reviewType?: string | null;
  /** `reviews.decision_status` — drives Complete pill colour. */
  decisionStatus?: string | null;
  /** `reviews.require_decision_maker` — Complete + no decision → mushroom when false. */
  requireDecisionMaker?: boolean;
  /**
   * Review creator (submitter) — shown on the meta avatar.
   * Prefer `creatorName`; `ownerName` must be the same person (`reviews.owner_display_name`), not the decision maker.
   */
  creatorName?: string;
  /** Canonical contributors.id for deterministic avatar colour (from `reviews.creator_id`). */
  creatorId?: string;
  /** Contributor email for stable cross-workspace avatar colour. */
  creatorEmail?: string | null;
  /** Auth user id for stable creator avatar colour (matches teammates settings). */
  creatorUserId?: string | null;
  creatorAvatarSrc?: string;
  /** Review creator display name when `creatorName` is not passed (not the decision maker). */
  ownerName?: string;
  /** @deprecated Use `creatorAvatarSrc`. */
  ownerAvatarSrc?: string;
  dateLabel?: string;
  dateTooltipIso?: string;
  /** Client name tag below description (Project Detail). Hidden when `breadcrumb` is set. */
  clientName?: string;
  /**
   * [client name] / [project name] row (All Reviews). Mutually exclusive with `clientName`.
   * Project links to project detail; client without a name shows as disabled "Undefined".
   */
  breadcrumb?: {
    clientName: string | null;
    projectName: string;
    projectId: string;
  } | null;
  description?: string;
  /** Show the description body */
  showDescription?: boolean;
  /** Show the artifact attachment row */
  hasArtifact?: boolean;
  artifactLabel?: string;
  /** Version chip rendered right-aligned in the footer (e.g. "v1") */
  iterationLabel?: string;
  feedbackCount?: number;
  changeRequestCount?: number;
  commentCount?: number;
  decisionCount?: number;
  showDecisionCount?: boolean;
  reviewers?: Array<{
    id?: string;
    userId?: string | null;
    email?: string | null;
    name: string;
    avatarSrc?: string | null;
  }>;
  /** When false, the footer (counts + iteration) is hidden */
  showDetailCounts?: boolean;
  onClick?: () => void;
  className?: string;
}

function norm(s: string | null | undefined) {
  return String(s ?? '').trim().toLowerCase();
}

function formatFeedbackChangeRequestCounts(
  status: ReviewStatus,
  feedbackCount: number,
  changeRequestCount: number,
): string | null {
  const k = norm(status);
  const hideWhenZero =
    (k === 'complete' || k === 'approved' || k === 'archived') &&
    feedbackCount === 0 &&
    changeRequestCount === 0;

  if (hideWhenZero) return null;

  if (changeRequestCount > 0 && feedbackCount > 0) {
    return `${feedbackCount} feedback · ${changeRequestCount} ${
      changeRequestCount === 1 ? 'change request' : 'change requests'
    }`;
  }
  if (changeRequestCount > 0 && feedbackCount === 0) {
    return `${changeRequestCount} ${
      changeRequestCount === 1 ? 'change request' : 'change requests'
    }`;
  }
  if (feedbackCount > 0) {
    return `${feedbackCount} feedback`;
  }
  return '0 feedback';
}

export function ReviewCard({
  title,
  status,
  reviewType = null,
  decisionStatus = null,
  requireDecisionMaker = true,
  creatorName,
  creatorId,
  creatorEmail,
  creatorUserId,
  creatorAvatarSrc,
  ownerName,
  ownerAvatarSrc,
  dateLabel,
  dateTooltipIso: _dateTooltipIso,
  clientName,
  breadcrumb = null,
  description,
  showDescription = true,
  hasArtifact = false,
  artifactLabel,
  iterationLabel,
  feedbackCount,
  changeRequestCount,
  commentCount,
  decisionCount,
  showDecisionCount = true,
  reviewers = [],
  showDetailCounts = true,
  onClick,
  className,
}: ReviewCardProps) {
  const openChangeRequests = changeRequestCount ?? 0;
  const pill = resolveReviewStatusPill({
    status,
    reviewType,
    decisionStatus,
    openChangeRequestCount: openChangeRequests,
  });
  const statusNorm = norm(status);
  const reviewerAvatarRing = statusNorm === 'needs-changes';
  const reviewTypeNorm = normalizeReviewTypeKey(reviewType);
  const showCompareOpenCrWarning =
    reviewTypeNorm === 'compare' &&
    openChangeRequests > 0 &&
    (statusNorm === 'approved' || statusNorm === 'complete');
  const statusPillProminence =
    showCompareOpenCrWarning ||
    (pill.color === 'brand' && statusNorm === 'complete')
      ? 'high'
      : 'default';
  /** Avatar always reflects the review creator (submitter), never reviewers[0] / decision maker. */
  const metaName = creatorName ?? ownerName;
  const metaAvatarSrc = creatorAvatarSrc ?? ownerAvatarSrc;
  const metaContributorId = creatorId?.trim() || undefined;
  const metaColourKey = avatarColourKey(creatorEmail, metaContributorId, metaName);
  const hiddenReviewers = reviewers.length > 3 ? reviewers.slice(3) : [];
  const hiddenReviewerTooltipLabel = hiddenReviewers.map((reviewer) => reviewer.name).join('\n');

  const rootClass = [styles.root, className ?? ''].filter(Boolean).join(' ');

  const titleClass = styles.title;

  const countsClass = styles.counts;

  const artifactClass = styles.artifact;

  const footerClass = styles.footer;

  const countText =
    feedbackCount !== undefined || changeRequestCount !== undefined
      ? formatFeedbackChangeRequestCounts(
          status,
          feedbackCount ?? 0,
          changeRequestCount ?? 0,
        )
      : [
          commentCount !== undefined
            ? `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`
            : null,
          showDecisionCount && decisionCount !== undefined
            ? `${decisionCount} ${decisionCount === 1 ? 'decision' : 'decisions'}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || null;

  const showFooterSection =
    showDetailCounts && (countText != null || iterationLabel || reviewers.length > 0);
  const showBreadcrumb = breadcrumb != null;
  const showClientTag = !showBreadcrumb && Boolean(clientName?.trim());
  const descriptionText = description?.trim() ?? '';
  const hasDescription = showDescription && descriptionText.length > 0;

  const breadcrumbSegments: BreadcrumbSegment[] | null = showBreadcrumb
    ? (() => {
        const hasClient = Boolean(breadcrumb!.clientName?.trim());
        const projectHref = `/projects/${breadcrumb!.projectId.trim()}`;
        return [
          {
            label: hasClient ? breadcrumb!.clientName!.trim() : 'Undefined',
            disabled: !hasClient,
          },
          {
            label: breadcrumb!.projectName,
            href: projectHref,
          },
        ];
      })()
    : null;

  return (
    <article
      className={rootClass}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <h3 className="m-0 min-w-0 w-full">
        <TruncatedTooltip label={title} className={titleClass} fullWidth maxWidth={320}>
          {title}
        </TruncatedTooltip>
      </h3>

      <div className={styles.meta}>
        {pill.tooltip ? (
          <Tooltip label={pill.tooltip} position="top">
            <span className="inline-flex shrink-0">
              <StatusPill
                color={pill.color}
                appearance="filled"
                prominence={statusPillProminence}
                leadingIcon={
                  showCompareOpenCrWarning ? (
                    <Warning size={16} weight="fill" aria-hidden />
                  ) : undefined
                }
                label={pill.label}
                size="sm"
              />
            </span>
          </Tooltip>
        ) : (
          <StatusPill
            color={pill.color}
            appearance="filled"
            prominence={statusPillProminence}
            leadingIcon={
              showCompareOpenCrWarning ? (
                <Warning size={16} weight="fill" aria-hidden />
              ) : undefined
            }
            label={pill.label}
            size="sm"
          />
        )}
        {(metaName || metaAvatarSrc || metaContributorId) && (
          <Avatar
            src={metaAvatarSrc}
            name={metaName?.trim() || undefined}
            contributorId={metaColourKey}
            size="md"
            style={getAvatarInlineStyle(metaColourKey)}
          />
        )}
        {dateLabel && (
          <TruncatedTooltip label={dateLabel} className={styles.date}>
            {dateLabel}
          </TruncatedTooltip>
        )}
      </div>

      {hasDescription ? (
        <div className={styles.descriptionSlot}>
          <Tooltip label={descriptionText} position="top" maxWidth={320} fullWidth>
            <p className={styles.description}>{descriptionText}</p>
          </Tooltip>
        </div>
      ) : null}

      {breadcrumbSegments ||
      showClientTag ||
      hasArtifact ||
      showFooterSection ? (
        <div className={styles.cardBottom}>
          {breadcrumbSegments ? (
            <div
              className={styles.breadcrumbRow}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Breadcrumb segments={breadcrumbSegments} variant="compact" />
            </div>
          ) : null}

          {showClientTag ? (
            <div className={styles.clientTagRow}>
              <Tag label={clientName!.trim()} variant="mushroom" size="sm" />
            </div>
          ) : null}

          {hasArtifact ? (
            <div className={artifactClass}>
              <span className={styles.artifactText}>
                📎&nbsp;&nbsp;{artifactLabel ?? 'Figma artifact attached'}
              </span>
            </div>
          ) : null}

          {showFooterSection ? (
            <div>
              {iterationLabel ? (
                <div className={styles.iterationRow}>
                  <span className={styles.iterationSlot}>
                    <Tag label={iterationLabel} variant="mushroom" size="sm" />
                  </span>
                </div>
              ) : null}
              {countText || reviewers.length > 0 ? (
                <div className={footerClass}>
                  {countText ? <span className={countsClass}>{countText}</span> : <span />}
                  {reviewers.length > 0 ? (
                    <span className={styles.reviewersSlot}>
                      {reviewers.slice(0, 3).map((reviewer, index) => {
                        const reviewerColourKey = avatarColourKey(
                          reviewer.email,
                          reviewer.id,
                          reviewer.name,
                        );
                        return (
                        <span
                          key={`${reviewer.name}-${index}`}
                          className={styles.reviewerAvatar}
                          style={{ zIndex: reviewers.length - index }}
                        >
                          <Avatar
                            src={reviewer.avatarSrc ?? undefined}
                            name={reviewer.name}
                            contributorId={reviewerColourKey}
                            size="md"
                            style={
                              reviewer.id || reviewer.userId
                                ? getAvatarInlineStyle(reviewerColourKey, {
                                    ring: reviewerAvatarRing,
                                  })
                                : undefined
                            }
                          />
                        </span>
                        );
                      })}
                      {reviewers.length > 3 ? (
                        <Tooltip
                          label={hiddenReviewerTooltipLabel}
                          position="top"
                          maxWidth={320}
                        >
                          <span
                            className={styles.reviewerOverflow}
                            style={{ zIndex: 0 }}
                            aria-label={`${reviewers.length - 3} more reviewers`}
                          >
                            +{reviewers.length - 3}
                          </span>
                        </Tooltip>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
