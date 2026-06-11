'use client';

import type { ReactNode } from 'react';
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

export type StatusPillDisplay = {
  label: string;
  color: StatusPillColor;
  legacyStatus?: StatusPillStatus;
};

function normalizeStatusPillKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

/** Canonical lifecycle status → pill label / colour (DS source of truth). */
export const STATUS_PILL_DISPLAY: Record<string, StatusPillDisplay> = {
  draft: { label: 'Draft', color: 'mushroom', legacyStatus: 'draft' },
  'in-review': { label: 'In Review', color: 'butter', legacyStatus: 'in-review' },
  'needs-changes': { label: 'Needs Changes', color: 'brand', legacyStatus: 'needs-changes' },
  'changes-needed': { label: 'Needs Changes', color: 'brand', legacyStatus: 'needs-changes' },
  'feedback-submitted': {
    label: 'Feedback Submitted',
    color: 'blue',
    legacyStatus: 'feedback-submitted',
  },
  'direction-approved': { label: 'Direction Approved', color: 'green' },
  paused: { label: 'Paused', color: 'mushroom', legacyStatus: 'paused' },
  complete: { label: 'Complete', color: 'green' },
  approved: { label: 'Approved', color: 'green', legacyStatus: 'approved' },
  blocked: { label: 'Blocked', color: 'error', legacyStatus: 'blocked' },
  closed: { label: 'Closed', color: 'mushroom', legacyStatus: 'closed' },
  archived: { label: 'Archived', color: 'mushroom' },
};

export function resolveStatusPillDisplay(statusRaw: string): StatusPillDisplay | null {
  return STATUS_PILL_DISPLAY[normalizeStatusPillKey(statusRaw)] ?? null;
}

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
  /** Optional icon before label (10px slot; inherits pill text colour). */
  leadingIcon?: ReactNode;
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
  leadingIcon,
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
    usesTokens && prominence === 'high' ? styles.tokenHigh : '',
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
      {leadingIcon ? (
        <span className={styles.leadingIcon} aria-hidden="true">
          {leadingIcon}
        </span>
      ) : null}
      <span className={styles.label}>{label}</span>
      {isInteractive && (
        <span className={styles.chevron} aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      )}
    </Tag>
  );
}
