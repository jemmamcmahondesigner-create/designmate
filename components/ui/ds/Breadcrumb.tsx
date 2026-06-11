'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import styles from './Breadcrumb.module.css';

export interface BreadcrumbSegment {
  label: string;
  /** Navigable segment — hover and focus styles from DS tokens. */
  href?: string;
  /** Non-interactive segment (e.g. client not set). */
  disabled?: boolean;
}

export type BreadcrumbVariant = 'default' | 'compact';

export interface BreadcrumbProps {
  segments?: BreadcrumbSegment[];
  /** Plain-text fallback when `segments` is empty. */
  fallback?: string;
  variant?: BreadcrumbVariant;
  className?: string;
  'aria-label'?: string;
}

export function Breadcrumb({
  segments,
  fallback,
  variant = 'default',
  className,
  'aria-label': ariaLabel = 'Breadcrumb',
}: BreadcrumbProps) {
  const rootClass = [
    styles.root,
    variant === 'compact' ? styles.rootCompact : styles.rootDefault,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!segments || segments.length === 0) {
    if (!fallback) return null;
    return (
      <p
        className={[styles.root, styles.rootDefault, styles.fallback, className ?? '']
          .filter(Boolean)
          .join(' ')}
      >
        {fallback}
      </p>
    );
  }

  const sep = variant === 'compact' ? '/' : '  /  ';

  return (
    <nav className={rootClass} aria-label={ariaLabel}>
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        return (
          <Fragment key={`${segment.label}-${i}`}>
            <span className={styles.segmentWrap}>
              {segment.disabled ? (
                <span className={styles.disabled} aria-disabled="true">
                  {segment.label}
                </span>
              ) : segment.href ? (
                <Link href={segment.href} className={styles.link}>
                  {segment.label}
                </Link>
              ) : (
                <span
                  className={
                    isLast && variant === 'default' ? styles.current : styles.segment
                  }
                >
                  {segment.label}
                </span>
              )}
            </span>
            {!isLast ? (
              <span className={styles.sep} aria-hidden="true">
                {sep}
              </span>
            ) : null}
          </Fragment>
        );
      })}
    </nav>
  );
}
