'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Icon } from './Icon';
import { Menu, MenuItem } from './Menu';
import { StatusPill } from './StatusPill';
import type { StatusPillStatus } from './StatusPill';
import { Tag } from './Tag';
import { Tooltip } from './Tooltip';
import styles from './TradeoffCard.module.css';

export type TradeoffSeverity = 'High' | 'Medium' | 'Low';

export type TradeoffCardLayout = 'inline' | 'stacked';

export interface TradeoffCardProps {
  label: string;
  severity: TradeoffSeverity;
  artifactLabel?: string;
  layout?: TradeoffCardLayout;
  /** Enables sentiment-border hover treatment (review detail edit mode). */
  interactive?: boolean;
  /** Stacked layout only — clamp description to N lines (default 3). */
  clampLines?: number;
  className?: string;
  onRemove?: () => void;
  showKebab?: boolean;
  kebabOpen?: boolean;
  onKebabToggle?: () => void;
  onKebabClose?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  menuRef?: (node: HTMLDivElement | null) => void;
}

function severityStatus(severity: TradeoffSeverity): StatusPillStatus {
  if (severity === 'High') return 'blocked';
  if (severity === 'Medium') return 'in-review';
  return 'feedback-submitted';
}

function SeverityPill({
  severity,
  prominence,
}: {
  severity: TradeoffSeverity;
  prominence: 'default' | 'high';
}) {
  return (
    <StatusPill
      status={severityStatus(severity)}
      label={severity}
      size="sm"
      prominence={prominence}
    />
  );
}

function ClampedLabel({
  text,
  clampLines,
}: {
  text: string;
  clampLines: number;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [text, clampLines]);

  const label = (
    <p
      ref={ref}
      className={styles.labelStacked}
      style={{ WebkitLineClamp: clampLines }}
    >
      {text}
    </p>
  );

  if (!overflow) return label;

  return (
    <Tooltip label={text} position="top" maxWidth={320} fullWidth>
      {label}
    </Tooltip>
  );
}

export function TradeoffCard({
  label,
  severity,
  artifactLabel,
  layout = 'inline',
  interactive = false,
  clampLines = 3,
  className,
  onRemove,
  showKebab = false,
  kebabOpen = false,
  onKebabToggle,
  onKebabClose,
  onEdit,
  onDelete,
  menuRef,
}: TradeoffCardProps) {
  const kebabRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const isStacked = layout === 'stacked';
  const hasKebab = showKebab && Boolean(onKebabToggle && onEdit && onDelete);
  const pillProminence: 'default' | 'high' =
    isStacked || (interactive && hovered) ? 'default' : 'high';
  const severityClass =
    severity === 'High'
      ? styles.severityHigh
      : severity === 'Medium'
        ? styles.severityMedium
        : styles.severityLow;

  useEffect(() => {
    menuRef?.(kebabRef.current);
    return () => menuRef?.(null);
  }, [menuRef]);

  const rootClass = [
    styles.root,
    isStacked ? styles.layoutStacked : styles.layoutInline,
    severityClass,
    interactive ? styles.interactive : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const artifactTag = artifactLabel ? (
    <Tag label={artifactLabel} variant="neutral" size="sm" />
  ) : null;

  if (isStacked) {
    return (
      <article
        className={[
          rootClass,
          onRemove ? styles.layoutStackedWithRemove : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseEnter={() => interactive && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className={styles.body}>
          <ClampedLabel text={label} clampLines={clampLines} />
        </div>
        <div className={styles.footer}>
          {artifactTag}
          <SeverityPill severity={severity} prominence={pillProminence} />
        </div>
        {onRemove ? (
          <button
            type="button"
            className={styles.removeButton}
            aria-label="Remove tradeoff"
            onClick={onRemove}
          >
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </article>
    );
  }

  return (
    <article
      className={rootClass}
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={styles.body}>
        <Tooltip label={label} position="top" maxWidth={320} fullWidth>
          <p className={styles.labelInline}>{label}</p>
        </Tooltip>
      </div>
      <div className={styles.meta}>
        {artifactTag}
        <SeverityPill severity={severity} prominence={pillProminence} />
      </div>
      {hasKebab ? (
        <div ref={kebabRef} className={styles.kebabAnchor}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`More options for ${label}`}
            onClick={onKebabToggle}
          >
            <Icon name="kebab" size={14} />
          </button>
          {kebabOpen ? (
            <Menu
              open
              onClose={() => onKebabClose?.()}
              anchorRef={kebabRef as RefObject<HTMLElement>}
              align="right"
              type="context-menu"
            >
              <MenuItem label="Edit" icon="edit" onClick={() => onEdit?.()} />
              <MenuItem
                label="Delete"
                icon="trash"
                destructive
                onClick={() => onDelete?.()}
              />
            </Menu>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
