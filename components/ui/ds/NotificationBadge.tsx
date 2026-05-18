'use client';

import styles from './NotificationBadge.module.css';

export type NotificationBadgeVariant = 'number' | 'dot';
export type NotificationBadgeSentiment = 'brand' | 'success' | 'warning' | 'error' | 'disabled';
export type NotificationBadgeProminence = 'high' | 'low';

export interface NotificationBadgeProps {
  variant?: NotificationBadgeVariant;
  /** Count displayed for variant="number" */
  count?: number;
  sentiment?: NotificationBadgeSentiment;
  prominence?: NotificationBadgeProminence;
  className?: string;
}

export function NotificationBadge({
  variant = 'number',
  count = 0,
  sentiment = 'brand',
  prominence = 'high',
  className,
}: NotificationBadgeProps) {
  if (variant === 'dot') {
    const dotClass = [
      styles.dot,
      styles[`dot-${sentiment}`],
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return <span className={dotClass} role="status" aria-label={`${sentiment} indicator`} />;
  }

  // Number variant
  const badgeClass = [
    styles.badge,
    styles[`badge-${sentiment}`],
    prominence === 'low' ? styles.low : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={badgeClass} role="status" aria-label={`${count} notifications`}>
      {count}
    </span>
  );
}
