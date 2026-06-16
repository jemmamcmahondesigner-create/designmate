'use client';

import type { CSSProperties } from 'react';
import { getAvatarColour } from '@/lib/utils/avatarColour';
import styles from './Avatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg';

export type AvatarProminence = 'default' | 'high';

export interface AvatarProps {
  /** Image URL. If omitted, falls back to initials. */
  src?: string;
  /** Alt text for the image */
  alt?: string;
  /** Displayed as initials when no image src is provided */
  name?: string;
  /** Stable contributor id — preferred key for deterministic background colour. */
  contributorId?: string;
  size?: AvatarSize;
  prominence?: AvatarProminence;
  className?: string;
  /** Optional override for initials avatar colours (activity log, etc.). */
  style?: CSSProperties;
}

/**
 * Two-letter initials from a display name: first + last token when multiple
 * words; otherwise the first two letters of the single token.
 */
export function getDisplayNameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  src,
  alt,
  name,
  contributorId,
  size = 'md',
  prominence = 'default',
  className,
  style,
}: AvatarProps) {
  const rootClass = [
    styles.root,
    styles[`size-${size}`],
    prominence === 'high' ? styles.prominenceHigh : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  if (src) {
    return (
      <span className={rootClass} style={style}>
        <img
          src={src}
          alt={alt ?? name ?? 'Avatar'}
          className={styles.img}
        />
      </span>
    );
  }

  const initials = name ? getDisplayNameInitials(name) : '?';
  const colourKey = (contributorId ?? '').trim();
  const palette = colourKey ? getAvatarColour(colourKey) : null;

  return (
    <span
      className={rootClass}
      aria-label={name ?? 'Avatar'}
      role="img"
      style={{
        ...(palette
          ? { backgroundColor: palette.bg, color: palette.text }
          : undefined),
        ...style,
      }}
    >
      <span className={styles.initials} style={{ color: 'inherit' }}>
        {initials}
      </span>
    </span>
  );
}
