'use client';

import { Icon, type IconName } from './Icon';
import styles from './Alert.module.css';

export type AlertSentiment = 'base' | 'success' | 'danger' | 'warning';
export type AlertProminence = 'low' | 'high';

export interface AlertProps {
  sentiment?: AlertSentiment;
  prominence?: AlertProminence;
  title: string;
  body?: string;
  /** Merged onto the body text span (e.g. utility classes) */
  bodyClassName?: string;
  /** Inline link text */
  linkText?: string;
  onLinkClick?: () => void;
  /** Optional action button */
  actionLabel?: string;
  onAction?: () => void;
  /** Static pill on the right (e.g. “Decision Maker: Required”) — not a button */
  trailingBadgeLabel?: string;
  /** Author name shown in details row */
  authorName?: string;
  timestamp?: string;
  /** Whether to show the dismiss (X) button */
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

// Sentiment icon names from the DS Icon component
const SENTIMENT_ICONS: Record<AlertSentiment, IconName> = {
  base: 'info',
  success: 'check-circle-fill',
  danger: 'status-blocked',
  warning: 'status-blocked',
};

export function Alert({
  sentiment = 'base',
  prominence = 'low',
  title,
  body,
  bodyClassName,
  linkText,
  onLinkClick,
  actionLabel,
  onAction,
  trailingBadgeLabel,
  authorName,
  timestamp,
  dismissible = true,
  onDismiss,
  className,
}: AlertProps) {
  const isHigh = prominence === 'high';

  const rootClass = [
    styles.root,
    styles[`sentiment-${sentiment}`],
    isHigh ? styles.high : styles.low,
    className ?? '',
  ].filter(Boolean).join(' ');

  const titleClass = [styles.title, isHigh ? styles.titleInverse : styles.titleDefault].join(' ');
  const bodyClass = [
    styles.body,
    isHigh ? styles.bodyInverse : styles.bodyDefault,
    bodyClassName ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const linkClass = [styles.link, isHigh ? styles.linkInverse : styles.linkBrand].join(' ');
  const detailsClass = [styles.details, isHigh ? styles.detailsInverse : ''].join(' ');

  return (
    <div className={rootClass} role="alert">
      {/* Icon + content */}
      <div className={styles.inner}>
        {/* Leading icon */}
        <div className={styles.iconWrap} aria-hidden="true">
          <Icon name={SENTIMENT_ICONS[sentiment]} size={20} />
        </div>

        {/* Text block */}
        <div className={styles.content}>
          {title.trim() ? <p className={titleClass}>{title}</p> : null}

          {(body || linkText) && (
            <div className={styles.bodyRow}>
              {body && <span className={bodyClass}>{body}</span>}
              {linkText && (
                <button type="button" className={linkClass} onClick={onLinkClick}>
                  {linkText}
                </button>
              )}
            </div>
          )}

          {(authorName || timestamp) && (
            <div className={detailsClass}>
              {authorName && <span className={styles.author}>{authorName}</span>}
              {authorName && timestamp && <span className={styles.dot}>·</span>}
              {timestamp && <span className={styles.timestamp}>{timestamp}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Right-side actions */}
      <div className={styles.actions}>
        {trailingBadgeLabel ? (
          <span className={styles.badgePill}>{trailingBadgeLabel}</span>
        ) : null}
        {actionLabel && (
          <button
            type="button"
            className={[styles.actionBtn, isHigh ? styles.actionBtnInverse : styles.actionBtnDefault].join(' ')}
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}
        {dismissible && (
          <button
            type="button"
            className={styles.dismissBtn}
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
