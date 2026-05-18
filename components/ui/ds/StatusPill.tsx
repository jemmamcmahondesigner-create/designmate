'use client';

import { Icon } from './Icon';
import styles from './StatusPill.module.css';

/** Legacy semantic keys — prefer `color` + `appearance` for new work. */
export type StatusPillStatus =
  | 'draft'
  | 'in-review'
  | 'approved'
  | 'needs-changes'
  | 'blocked'
  | 'closed'
  | 'feedback-submitted'
  | 'paused';

/** DLS semantic colours (Mushroom = neutral default surface). */
export type StatusPillColor = 'mushroom' | 'butter' | 'blue' | 'green' | 'brand' | 'error';

/** Filled = solid pill; Outline = border-led (e.g. decision row). */
export type StatusPillAppearance = 'filled' | 'outline';

export type StatusPillSize = 'sm' | 'md' | 'lg';
export type StatusPillProminence = 'default' | 'high';
export type StatusPillState = 'default' | 'interactive';

type DsTokenClass =
  | 'ds_mushroom_filled'
  | 'ds_mushroom_outline'
  | 'ds_butter_filled'
  | 'ds_butter_outline'
  | 'ds_blue_filled'
  | 'ds_blue_outline'
  | 'ds_green_filled'
  | 'ds_green_outline'
  | 'ds_brand_filled'
  | 'ds_brand_outline'
  | 'ds_error_filled'
  | 'ds_error_outline';

function dsTokenClass(color: StatusPillColor, appearance: StatusPillAppearance): DsTokenClass {
  const a = appearance === 'outline' ? 'outline' : 'filled';
  return `ds_${color}_${a}` as DsTokenClass;
}

export interface StatusPillProps {
  label: string;
  /** DLS semantic colour — when set, drives surface via CSS tokens (with `appearance`). */
  color?: StatusPillColor;
  /** Surface treatment when `color` is set. Ignored for legacy `status` styling. */
  appearance?: StatusPillAppearance;
  /** Legacy mapping — used when `color` is omitted. */
  status?: StatusPillStatus;
  size?: StatusPillSize;
  prominence?: StatusPillProminence;
  state?: StatusPillState;
  /** Lg + interactive opens a menu pattern (chevron). */
  onClick?: () => void;
  className?: string;
  /** Default overline caption; `body` uses 13px sentence case for table-style labels. */
  labelTypography?: 'overline' | 'body';
}

export function StatusPill({
  label,
  color,
  appearance = 'filled',
  status = 'draft',
  size = 'sm',
  prominence = 'default',
  state = 'default',
  onClick,
  className,
  labelTypography = 'overline',
}: StatusPillProps) {
  const isInteractive = state === 'interactive' && size === 'lg';
  const usesTokens = Boolean(color);

  const tokenClass = usesTokens ? styles[dsTokenClass(color!, appearance)] : '';

  const legacyClasses = usesTokens
    ? ''
    : [
        styles[`status-${status}`],
        prominence === 'high' ? styles.high : '',
        isInteractive ? styles.interactive : '',
      ]
        .filter(Boolean)
        .join(' ');

  const rootClass = [
    styles.root,
    usesTokens ? tokenClass : legacyClasses,
    usesTokens && isInteractive ? styles.interactive : '',
    styles[`size-${size}`],
    labelTypography === 'body' ? styles.typographyBody : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const Tag = isInteractive ? 'button' : 'span';

  return (
    <Tag
      className={rootClass}
      onClick={isInteractive ? onClick : undefined}
      type={isInteractive ? 'button' : undefined}
      aria-haspopup={isInteractive ? 'menu' : undefined}
    >
      <span className={styles.label}>{label}</span>
      {isInteractive && (
        <span className={styles.chevron} aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      )}
    </Tag>
  );
}
