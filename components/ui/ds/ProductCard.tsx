'use client';

import Link from 'next/link';
import { StatusPill, type StatusPillStatus } from './StatusPill';
import { Tag } from './Tag';
import { Avatar } from './Avatar';
import { getAvatarInlineStyle } from '@/lib/utils/avatarColour';
import styles from './ProductCard.module.css';

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
  decisionCount?: number;
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
  decisionCount,
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
        {reviewCount !== undefined && (
          <span className={styles.count}>{reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}</span>
        )}
        {decisionCount !== undefined && (
          <span className={styles.count}>{decisionCount} {decisionCount === 1 ? 'decision' : 'decisions'}</span>
        )}
      </div>

      {description && (
        <p className={styles.description}>{description}</p>
      )}

      <div className={styles.footer}>
        {tagLabel && (
          <Tag label={tagLabel} variant="butter" size="sm" />
        )}
        {contributors.length > 0 && (
          <div className={styles.avatarGroup}>
            {contributors.slice(0, 4).map((c, i) => (
              <div
                key={c.id || i}
                className={styles.avatarWrap}
                style={{ zIndex: 4 - i }}
              >
                <Avatar
                  src={c.avatarSrc}
                  name={c.name}
                  contributorId={c.id}
                  size="md"
                  style={getAvatarInlineStyle(c.id)}
                />
              </div>
            ))}
          </div>
        )}
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
