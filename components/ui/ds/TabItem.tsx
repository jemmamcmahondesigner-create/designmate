'use client';

import styles from './TabItem.module.css';
import { NotificationBadge } from './NotificationBadge';

export type TabItemStyle = 'pill' | 'underline';

export interface TabItemProps {
  label: string;
  active?: boolean;
  style?: TabItemStyle;
  /** Optional notification badge count */
  badgeCount?: number;
  showBadge?: boolean;
  onClick?: () => void;
  className?: string;
}

export function TabItem({
  label,
  active = false,
  style = 'pill',
  badgeCount,
  showBadge = false,
  onClick,
  className,
}: TabItemProps) {
  const rootClass = [
    styles.root,
    style === 'pill' ? styles.pill : styles.underline,
    active ? styles.active : styles.inactive,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={rootClass}
      onClick={onClick}
    >
      <span className={styles.label}>{label}</span>
      {showBadge && badgeCount !== undefined && badgeCount > 0 && (
        <NotificationBadge
          variant="number"
          count={badgeCount}
          sentiment="brand"
          prominence="low"
          className={[styles.badge, active ? styles.badgeActive : styles.badgeInactive].join(' ')}
        />
      )}
    </button>
  );
}
