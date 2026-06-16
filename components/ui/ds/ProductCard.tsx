'use client';

import Link from 'next/link';
import { StatusPill, type StatusPillStatus } from './StatusPill';
import { Tag } from './Tag';
import { Avatar } from './Avatar';
import { Tooltip } from './Tooltip';
import { getAvatarInlineStyle } from '@/lib/utils/avatarColour';
import {
  formatProjectReviewBreakdownTooltip,
  type ProjectReviewStatusBreakdown,
} from '@/lib/reviews/projectReviewStatusBreakdown';
import styles from './ProductCard.module.css';

const MAX_VISIBLE_TEAMMATES = 5;

export interface ProductCardContributor {
  id: string;
  name: string;
  avatarSrc?: string;
}

export interface ProductCardProps {
  title: string;
  /** Project status pill */
  statusLabel?: string;
  /** Visual tone for the status pill (defaults to approved) */
  statusVariant?: StatusPillStatus;
  reviewCount?: number;
  /** Per-status counts for the review-count hover tooltip. */
  reviewStatusBreakdown?: ProjectReviewStatusBreakdown;
  description?: string;
  /** Category / client tag shown bottom-left */
  tagLabel?: string;
  contributors?: ProductCardContributor[];
  /** When set, the card renders as a next/link. Preferred over onClick for navigation. */
  href?: string;
  /** Non-navigation click handler. Ignored when `href` is set — use `href` for navigation. */
  onClick?: () => void;
  className?: string;
}

export function ProductCard({
  title,
  statusLabel = 'Active',
  statusVariant = 'approved',
  reviewCount,
  reviewStatusBreakdown,
  description,
  tagLabel,
  contributors = [],
  href,
  onClick,
  className,
}: ProductCardProps) {
  const isInteractive = Boolean(href || onClick);
  const rootClass = [
    styles.root,
    isInteractive ? styles.clickable : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  const visibleContributors = contributors.slice(0, MAX_VISIBLE_TEAMMATES);
  const overflowCount = Math.max(0, contributors.length - MAX_VISIBLE_TEAMMATES);
  const teammateTooltipLabel = contributors.map((c) => c.name).join('\n');

  const body = (
    <>
      <h3 className={styles.title}>{title}</h3>

      <div className={styles.meta}>
        <StatusPill
          status={statusVariant}
          label={statusLabel}
          size="sm"
          prominence="high"
        />
        <div className={styles.metaTrailing}>
          {contributors.length > 0 ? (
            <Tooltip
              label={teammateTooltipLabel}
              position="top"
              maxWidth={320}
            >
              <span
                className={styles.metaAvatarGroup}
                aria-label={`${contributors.length} teammates`}
              >
                {visibleContributors.map((c, i) => (
                  <span
                    key={c.id || i}
                    className={styles.metaAvatarWrap}
                    style={{ zIndex: visibleContributors.length - i }}
                  >
                    <Avatar
                      src={c.avatarSrc}
                      name={c.name}
                      contributorId={c.id}
                      size="md"
                      style={getAvatarInlineStyle(c.id)}
                    />
                  </span>
                ))}
                {overflowCount > 0 ? (
                  <span
                    className={styles.metaAvatarOverflow}
                    style={{ zIndex: 0 }}
                    aria-hidden
                  >
                    +{overflowCount}
                  </span>
                ) : null}
              </span>
            </Tooltip>
          ) : null}
          {reviewCount !== undefined ? (
            reviewCount > 0 && reviewStatusBreakdown ? (
              <Tooltip
                label={formatProjectReviewBreakdownTooltip(reviewStatusBreakdown)}
                position="top"
                maxWidth={320}
              >
                <span className={styles.count}>
                  {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
                </span>
              </Tooltip>
            ) : (
              <span className={styles.count}>
                {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
              </span>
            )
          ) : null}
        </div>
      </div>

      {description && (
        <p className={styles.description}>{description}</p>
      )}

      <div className={styles.footer}>
        {tagLabel ? (
          <Tag label={tagLabel} variant="mushroom" size="sm" />
        ) : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={rootClass} aria-label={title}>
        {body}
      </Link>
    );
  }

  return (
    <article
      className={rootClass}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {body}
    </article>
  );
}
