'use client';

import { Icon } from './Icon';
import styles from './TradeOffBlock.module.css';

export type TradeOffSentiment = 'success' | 'brand' | 'error';

export interface TradeOffOption {
  sentiment: TradeOffSentiment;
  heading?: string;
  body: string;
  /** Short label e.g. "Good", "High" */
  pillLabel?: string;
  showKebab?: boolean;
  onKebabClick?: () => void;
  /** Primary action button label (brand/dark rows) */
  actionLabel?: string;
  onActionClick?: () => void;
}

export interface TradeOffBlockProps {
  /** Contextual note about why this trade-off exists */
  note?: string;
  options: TradeOffOption[];
  className?: string;
}

export function TradeOffBlock({ note, options, className }: TradeOffBlockProps) {
  const rootClass = [styles.root, className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerLabel}>TRADE-OFF</span>
      </div>

      {/* Note */}
      {note && (
        <div className={styles.noteRow}>
          <Icon name="info" size={16} style={{ color: '#998c82', flexShrink: 0 }} />
          <span className={styles.noteText}>{note}</span>
        </div>
      )}

      {/* Option rows */}
      <div className={styles.options}>
        {options.map((opt, i) => (
          <OptionRow key={i} option={opt} />
        ))}
      </div>
    </div>
  );
}

/* ── Option row ─────────────────────────────────────────────────────────────── */

function OptionRow({ option }: { option: TradeOffOption }) {
  const { sentiment, heading, body, pillLabel, showKebab, onKebabClick, actionLabel, onActionClick } = option;

  const rowClass = [
    styles.row,
    styles[`row-${sentiment}`],
  ].join(' ');

  const isBrand = sentiment === 'brand';

  return (
    <div className={rowClass}>
      {/* Left: heading + body */}
      <div className={styles.rowLeft}>
        {heading && (
          <div className={styles.rowHeading}>
            <Icon
              name="plus"
              size={16}
              style={{ color: sentiment === 'brand' ? '#ffffff' : '#6b1e2e' }}
            />
            <span className={[styles.rowHeadingText, isBrand ? styles.rowHeadingInverse : ''].join(' ')}>
              {heading}
            </span>
          </div>
        )}
        <div className={styles.rowContent}>
          <p className={[styles.rowBody, isBrand ? styles.rowBodyInverse : ''].join(' ')}>
            {body}
          </p>
          <div className={styles.rowActions}>
            {pillLabel && (
              <span className={[styles.pill, styles[`pill-${sentiment}`]].join(' ')}>
                {pillLabel}
              </span>
            )}
            {showKebab && onKebabClick && (
              <button type="button" className={[styles.iconBtn, isBrand ? styles.iconBtnInverse : ''].join(' ')} onClick={onKebabClick} aria-label="More options">
                <Icon
                  name="kebab"
                  size={14}
                  style={{ color: isBrand ? '#ffffff' : '#6b5e55' }}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: action button (brand rows) */}
      {actionLabel && (
        <div className={styles.rowRight}>
          <button type="button" className={styles.actionBtn} onClick={onActionClick}>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
