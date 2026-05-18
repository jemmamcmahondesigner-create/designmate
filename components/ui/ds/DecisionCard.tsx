'use client';

import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { StatusPill, type StatusPillColor } from './StatusPill';
import { Tag } from './Tag';
import styles from './DecisionCard.module.css';

// ─── DecisionCard ─────────────────────────────────────────────────────────────
// DLS node 55:195 (frame) → 55:110 (approved, Large)
//
// Structure:
//   [Recessed header: "DECISION STATUS" label + StatusPill]
//   [Content area:]
//     Option tags (brand/blush style, showing chosen direction)
//     Decision text body
//     Owner row: avatar + name
//     Optional "Recorded …" line (decision_made_at)
//     Trade-off block (optional): butter border, "TRADE-OFF ACCEPTED" overline,
//       AI stars icon, trade-off note text

/** @deprecated Kept for FinalDecisionDrawer / submit types; card uses `statusPillColor`. */
export type DecisionStatus =
  | 'approved'
  | 'needs-changes'
  | 'in-review'
  | 'blocked'
  | 'draft';

export interface DecisionOption {
  label: string;
}

export interface DecisionCardProps {
  /** DLS semantic colour for the decision status pill (outline). */
  statusPillColor: StatusPillColor;
  statusPillLabel: string;
  /** Chosen option tags shown below the status header */
  options?: DecisionOption[];
  decisionText: string;
  ownerName: string;
  ownerAvatarSrc?: string;
  /** ISO timestamp — rendered as "Recorded … at …" when set. */
  recordedAtIso?: string | null;
  /** Whether to show the trade-off accepted block */
  showTradeOff?: boolean;
  tradeOffNote?: string;
  /** Whether trade-off was AI generated */
  tradeOffIsAI?: boolean;
  className?: string;
}

function formatRecordedLine(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `Recorded ${datePart} at ${timePart}`;
}

export function DecisionCard({
  statusPillColor,
  statusPillLabel,
  options = [],
  decisionText,
  ownerName,
  ownerAvatarSrc,
  recordedAtIso,
  showTradeOff = false,
  tradeOffNote,
  tradeOffIsAI = true,
  className,
}: DecisionCardProps) {
  const textOk = decisionText.trim().length > 0;
  const artifactsOk = options.length > 0;
  if (!textOk || !artifactsOk) {
    return (
      <article
        className={[styles.root, styles.emptyRoot, className ?? ''].filter(Boolean).join(' ')}
      >
        <p className={styles.emptyCopy}>No decision recorded yet.</p>
      </article>
    );
  }

  const recordedLine =
    recordedAtIso && !Number.isNaN(new Date(recordedAtIso).getTime())
      ? formatRecordedLine(recordedAtIso)
      : null;

  return (
    <article className={[styles.root, className ?? ''].filter(Boolean).join(' ')}>
      <div className={styles.statusHeader}>
        <span className={styles.statusLabel}>Decision Status</span>
        <StatusPill
          color={statusPillColor}
          appearance="outline"
          label={statusPillLabel}
          size="md"
        />
      </div>

      <div className={styles.content}>
        {options.length > 0 && (
          <div className={styles.options}>
            {options.map((opt, i) => (
              <Tag key={i} label={opt.label} variant="brand" size="sm" />
            ))}
          </div>
        )}

        <div className={styles.textBlock}>
          <p className={styles.decisionText}>{decisionText}</p>

          <div className={styles.ownerRow}>
            <div className={styles.ownerDetails}>
              <Avatar src={ownerAvatarSrc} name={ownerName} size="md" />
              <span className={styles.ownerName}>{ownerName}</span>
            </div>
          </div>

          {recordedLine ? <p className={styles.recordedLine}>{recordedLine}</p> : null}
        </div>

        {showTradeOff && (
          <div className={styles.tradeOff}>
            <div className={styles.tradeOffHeader}>
              <span className={styles.tradeOffLabel}>Trade-off Accepted</span>
              {tradeOffIsAI && (
                <span
                  className={styles.aiIcon}
                  aria-label="AI generated"
                  title="AI generated"
                  style={{ color: '#998c82' }}
                >
                  <Icon name="ai-stars" size={20} />
                </span>
              )}
            </div>
            {tradeOffNote && <p className={styles.tradeOffNote}>{tradeOffNote}</p>}
          </div>
        )}
      </div>
    </article>
  );
}
