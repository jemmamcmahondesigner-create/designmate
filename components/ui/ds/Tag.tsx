'use client';

import { useId } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './Tag.module.css';

export type TagVariant =
  | 'default'
  | 'brand'
  | 'mint'
  | 'butter'
  | 'aqua'
  | 'lilac'
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral';

export type TagSize = 'sm' | 'md';
export type TagIcon = 'none' | 'leading' | 'removable';

export interface TagProps {
  label: string;
  variant?: TagVariant;
  size?: TagSize;
  icon?: TagIcon;
  /** Leading glyph when `icon` is `leading` (defaults to plus). */
  leadingIcon?: IconName;
  /** Called when the remove button is clicked (only relevant when icon=removable) */
  onRemove?: () => void;
  className?: string;
}

export function Tag({
  label,
  variant = 'default',
  size = 'sm',
  icon = 'none',
  leadingIcon = 'plus',
  onRemove,
  className,
}: TagProps) {
  const removeId = useId();

  const rootClass = [
    styles.root,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    icon !== 'none' ? styles[`icon-${icon}`] : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={rootClass}>
      {icon === 'leading' && (
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon name={leadingIcon} size={14} />
        </span>
      )}

      <span className={styles.label}>{label}</span>

      {icon === 'removable' && (
        <button
          type="button"
          id={removeId}
          className={styles.removeBtn}
          aria-label={`Remove ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </span>
  );
}
