'use client';

import styles from './Avatar.module.css';

export type AvatarSize = 'md' | 'lg';

export interface AvatarProps {
  /** Image URL. If omitted, falls back to initials. */
  src?: string;
  /** Alt text for the image */
  alt?: string;
  /** Displayed as initials when no image src is provided */
  name?: string;
  size?: AvatarSize;
  className?: string;
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
  size = 'md',
  className,
}: AvatarProps) {
  const rootClass = [
    styles.root,
    styles[`size-${size}`],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  if (src) {
    return (
      <span className={rootClass}>
        <img
          src={src}
          alt={alt ?? name ?? 'Avatar'}
          className={styles.img}
        />
      </span>
    );
  }

  const initials = name ? getDisplayNameInitials(name) : '?';

  return (
    <span className={rootClass} aria-label={name ?? 'Avatar'} role="img">
      <span className={styles.initials}>{initials}</span>
    </span>
  );
}
