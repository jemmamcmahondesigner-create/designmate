'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Divider } from './Divider';
import { StatusPill } from './StatusPill';
import { Tag } from './Tag';
import { Tooltip } from './Tooltip';
import type { ReactNode } from 'react';
import { getAvatarInlineStyle, avatarColourKey } from '@/lib/utils/avatarColour';
import styles from './DecisionCard.module.css';

// ─── DecisionCard ─────────────────────────────────────────────────────────────
// DLS node 1236:46349

export type DecisionCardStatus =
  | 'approved'
  | 'changes-needed'
  | 'Preference'
  | 'PreferenceAmended';

/** @deprecated Use DecisionCardStatus */
export type DecisionStatus = DecisionCardStatus;

/** @deprecated Use artifactTags on DecisionCardProps */
export interface DecisionOption {
  label: string;
}

export type DecisionCardChangeRequestItem = {
  /** Source change_requests row id (for mark-complete actions). */
  id?: string;
  /** Dot notation batch index, e.g. "1.1", "2.1". */
  changeNumber: string;
  changesNeeded: string;
  artifactNames: string[];
  /** Row completed — per-row disabled styling. */
  completed?: boolean;
  showRowKebab?: boolean;
  rowKebabLabel?: string;
  onRowKebabClick?: () => void;
};

export interface DecisionCardProps {
  status: DecisionCardStatus;
  owner: string;
  ownerAvatarSrc?: string;
  ownerContributorId?: string;
  ownerContributorEmail?: string | null;
  timestamp: string;
  decisionText: string;
  artifactTags?: string[];
  /** Preference variant: concept name(s) the reviewer selected, rendered as aqua Tags. */
  selectedConcepts?: string[];
  changeRequests?: DecisionCardChangeRequestItem[];
  /** Greyed-out completed state for change request cards. */
  completed?: boolean;
  onKebabClick?: () => void;
  /** Secondary kebab action (e.g. Mark as completed / Reopen). */
  onSecondaryKebabClick?: () => void;
  secondaryKebabActionLabel?: string;
  showKebab?: boolean;
  /** Label for the single kebab menu action (defaults to "Submit additional feedback"). */
  kebabActionLabel?: string;
  /** Compare direction-approved pill when open change requests remain. */
  statusPillLabel?: string;
  statusPillColor?: 'green' | 'brand' | 'mushroom' | 'error' | 'butter' | 'blue';
  /** Compare: approved direction + inline change request rows (Figma 489:1348). */
  layout?: 'default' | 'directionWithInlineChanges';
  /** Superseded direction card — full-card disabled overlay. */
  superseded?: boolean;
  /** When true, completed CR kebabs are disabled (review status is complete). */
  reviewLifecycleComplete?: boolean;
  /** Resolve external URL for artifact/concept tag labels (chips open in new tab). */
  resolveArtifactTagHref?: (label: string) => string | null;
  className?: string;
}

const STATUS_PILL_LABEL: Record<DecisionCardStatus, string> = {
  approved: 'APPROVED',
  'changes-needed': 'CHANGES NEEDED',
  Preference: 'PREFERENCE SUBMITTED',
  PreferenceAmended: 'PREFERENCE SUBMITTED',
};

export function DecisionCard({
  status,
  owner,
  ownerAvatarSrc,
  ownerContributorId,
  ownerContributorEmail,
  timestamp,
  decisionText,
  artifactTags = [],
  selectedConcepts = [],
  changeRequests = [],
  completed = false,
  onKebabClick,
  onSecondaryKebabClick,
  secondaryKebabActionLabel,
  showKebab = false,
  kebabActionLabel = 'Submit additional feedback',
  statusPillLabel,
  statusPillColor,
  layout = 'default',
  superseded = false,
  reviewLifecycleComplete = false,
  resolveArtifactTagHref,
  className,
}: DecisionCardProps) {
  const [kebabOpen, setKebabOpen] = useState(false);
  const [rowKebabOpenIndex, setRowKebabOpenIndex] = useState<number | null>(null);
  const kebabRef = useRef<HTMLDivElement | null>(null);
  const rowKebabRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!kebabOpen && rowKebabOpenIndex === null) return;
    function onMouseDown(event: MouseEvent) {
      if (kebabOpen && !kebabRef.current?.contains(event.target as Node)) {
        setKebabOpen(false);
      }
      if (
        rowKebabOpenIndex !== null &&
        !rowKebabRef.current?.contains(event.target as Node)
      ) {
        setRowKebabOpenIndex(null);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [kebabOpen, rowKebabOpenIndex]);

  const isPreferenceVariant =
    status === 'Preference' || status === 'PreferenceAmended';
  const isPreferenceAmended = status === 'PreferenceAmended';
  const isDirectionWithInlineChanges = layout === 'directionWithInlineChanges';
  const avatarProminence = 'high' as const;
  const hasChangeRequests =
    (status === 'changes-needed' || isDirectionWithInlineChanges) &&
    changeRequests.length > 0;
  const footerTags = isPreferenceVariant ? selectedConcepts : artifactTags;
  const textOk = decisionText.trim().length > 0;
  const tagsOk = footerTags.length > 0;
  const cardDisabled = completed || superseded;
  const ownerColourKey = avatarColourKey(
    ownerContributorEmail,
    ownerContributorId,
    owner,
  );
  const headerAvatarStyle = getAvatarInlineStyle(ownerColourKey, { ring: true });
  if (!hasChangeRequests && !textOk && !tagsOk) {
    return (
      <article
        className={[styles.root, styles.emptyRoot, className ?? ''].filter(Boolean).join(' ')}
      >
        <p className={styles.emptyCopy}>No decision recorded yet.</p>
      </article>
    );
  }

  const headerBandClass = [
    styles.headerBand,
    status === 'approved'
      ? styles.headerBandApproved
      : status === 'Preference'
        ? styles.headerBandPreference
        : status === 'PreferenceAmended'
          ? styles.headerBandPreferenceAmended
          : styles.headerBandChangesNeeded,
  ]
    .filter(Boolean)
    .join(' ');

  const statusPillStatus = status === 'approved' ? 'approved' : 'needs-changes';

  const directionHeaderPillLabel =
    statusPillLabel ?? 'APPROVED DIRECTION';

  const completedCrKebabLocked = reviewLifecycleComplete;
  const completedCrKebabTooltip =
    'Reopen this review to manage change requests';

  function renderArtifactTag(
    label: string,
    variant: 'brand' | 'neutral' | 'aqua',
    key: string,
  ) {
    const href = resolveArtifactTagHref?.(label) ?? null;
    const tag = <Tag label={label} variant={variant} size="sm" />;
    if (!href) return <span key={key}>{tag}</span>;
    return (
      <a
        key={key}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex no-underline"
        onClick={(event) => event.stopPropagation()}
      >
        {tag}
      </a>
    );
  }

  function wrapKebabTrigger(node: ReactNode, locked: boolean) {
    if (!locked) return node;
    return (
      <Tooltip label={completedCrKebabTooltip} position="top">
        <span className="inline-flex opacity-50" style={{ pointerEvents: 'none' }}>
          {node}
        </span>
      </Tooltip>
    );
  }

  const cardArticle = (
    <article
      className={[
        styles.root,
        cardDisabled ? styles.rootCompleted : '',
        superseded ? styles.rootSuperseded : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {superseded ? (
        <span className={styles.supersededLabel}>Superseded</span>
      ) : null}
      <div
        className={[
          headerBandClass,
          completed ? styles.headerBandCompleted : '',
          superseded ? styles.headerBandSuperseded : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={styles.headerLeft}>
          <Avatar
            src={ownerAvatarSrc}
            name={owner}
            contributorId={ownerContributorId}
            size="md"
            prominence={avatarProminence}
            style={headerAvatarStyle}
          />
          <span className={styles.ownerName}>{owner}</span>
          {timestamp.trim() ? (
            <>
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
              <span className={styles.timestamp}>{timestamp}</span>
            </>
          ) : null}
        </div>
        <div className={styles.headerActions}>
          {showKebab ? (
            <div ref={kebabRef} style={{ position: 'relative' }}>
              {wrapKebabTrigger(
                <Button
                  type="button"
                  label="Decision actions"
                  aria-label="Decision actions"
                  variant="ghost"
                  size="sm"
                  icon="leading"
                  iconOnly
                  iconName="dots-three-vertical"
                  aria-expanded={kebabOpen}
                  aria-haspopup="menu"
                  disabled={completed && completedCrKebabLocked}
                  onClick={() => {
                    if (completed && completedCrKebabLocked) return;
                    setKebabOpen((open) => !open);
                  }}
                />,
                Boolean(completed && completedCrKebabLocked),
              )}
              {kebabOpen ? (
                <div
                  role="menu"
                  aria-label="Decision actions"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    zIndex: 20,
                    minWidth: 200,
                    background: '#ffffff',
                    border: '1px solid #e4ddd3',
                    borderRadius: 8,
                    boxShadow: '0 2px 8px rgba(41,33,28,0.12)',
                    padding: '4px 0',
                  }}
                >
                  {onKebabClick ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full border-0 bg-transparent text-left text-[13px] font-normal text-[#2e1c1c] cursor-pointer hover:bg-[#f3efe9]"
                      style={{ padding: '8px 12px' }}
                      onClick={() => {
                        setKebabOpen(false);
                        onKebabClick();
                      }}
                    >
                      {kebabActionLabel}
                    </button>
                  ) : null}
                  {onSecondaryKebabClick && secondaryKebabActionLabel ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full border-0 bg-transparent text-left text-[13px] font-normal text-[#2e1c1c] cursor-pointer hover:bg-[#f3efe9]"
                      style={{ padding: '8px 12px' }}
                      onClick={() => {
                        setKebabOpen(false);
                        onSecondaryKebabClick();
                      }}
                    >
                      {secondaryKebabActionLabel}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {status === 'Preference' ? (
            <span className={styles.preferencePill}>{STATUS_PILL_LABEL[status]}</span>
          ) : status === 'PreferenceAmended' ? (
            <span className={styles.preferencePillAmended}>
              {STATUS_PILL_LABEL[status]}
            </span>
          ) : isDirectionWithInlineChanges ? (
            <StatusPill
              color={superseded ? 'mushroom' : 'green'}
              appearance="filled"
              prominence="high"
              label={directionHeaderPillLabel}
              size="md"
            />
          ) : completed ? (
            <StatusPill
              color="mushroom"
              appearance="filled"
              prominence="high"
              label={statusPillLabel ?? STATUS_PILL_LABEL[status]}
              size="md"
            />
          ) : statusPillLabel && statusPillColor === 'green' ? (
            <StatusPill
              status="approved"
              prominence="high"
              label={statusPillLabel}
              size="md"
            />
          ) : statusPillLabel && statusPillColor ? (
            <StatusPill
              color={statusPillColor}
              appearance="filled"
              prominence="high"
              label={statusPillLabel}
              size="md"
            />
          ) : (
            <StatusPill
              status={statusPillStatus}
              prominence="high"
              label={STATUS_PILL_LABEL[status]}
              size="md"
            />
          )}
        </div>
      </div>

      <div className={styles.body}>
        {isDirectionWithInlineChanges ? (
          <>
            {textOk ? <p className={styles.decisionText}>{decisionText}</p> : null}
            {tagsOk ? (
              <div className={styles.tagsRow}>
                {footerTags.map((label, index) =>
                  renderArtifactTag(
                    label,
                    superseded ? 'neutral' : 'brand',
                    `${label}-${index}`,
                  ),
                )}
              </div>
            ) : null}
            {hasChangeRequests ? (
              <div className={styles.changesRequestedSection}>
                <div className={styles.changesRequestedDividerRow}>
                  <Divider className={styles.changesRequestedLine} />
                  <span className={styles.changesRequestedPillSlot}>
                    <StatusPill
                      color="brand"
                      appearance="filled"
                      prominence="default"
                      label="Needs Changes"
                      size="sm"
                    />
                  </span>
                  <Divider className={styles.changesRequestedLine} />
                </div>
                <div className={styles.changeRequestsBody}>
                  {changeRequests.map((cr, index) => {
                    const rowCompleted = Boolean(cr.completed);
                    const rowKebabLocked = rowCompleted && completedCrKebabLocked;
                    const rowKebabActive = Boolean(cr.showRowKebab && cr.onRowKebabClick);
                    return (
                      <div
                        key={cr.id ?? `${cr.changeNumber}-${index}`}
                        className={styles.changeRequestBlock}
                      >
                        {index > 0 ? (
                          <Divider className={styles.changeRequestDivider} />
                        ) : null}
                        <div className={styles.changeRequestItem}>
                          <div className={styles.changeRequestRow}>
                            <p
                              className={[
                                styles.changeRequestText,
                                rowCompleted ? styles.changeRequestTextCompleted : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {cr.changesNeeded || 'Change requested.'}
                            </p>
                            <Tag
                              variant={rowCompleted ? 'neutral' : 'butter'}
                              size="sm"
                              label={`Change ${cr.changeNumber}`}
                              className={styles.changeRequestTag}
                            />
                          </div>
                          <div className={styles.changeRequestFooterRow}>
                            {cr.artifactNames.length > 0 ? (
                              <div className={styles.tagsRow}>
                                {cr.artifactNames.map((name, tagIndex) =>
                                  renderArtifactTag(
                                    name,
                                    rowCompleted ? 'neutral' : 'brand',
                                    `${cr.changeNumber}-artifact-${tagIndex}`,
                                  ),
                                )}
                              </div>
                            ) : (
                              <span />
                            )}
                            {cr.showRowKebab && cr.onRowKebabClick ? (
                              <div
                                ref={rowKebabOpenIndex === index ? rowKebabRef : null}
                                className={
                                  rowCompleted ? styles.changeRequestKebabDisabled : undefined
                                }
                                style={{ position: 'relative', flexShrink: 0 }}
                              >
                                <Button
                                  type="button"
                                  label="Change request actions"
                                  aria-label="Change request actions"
                                  variant="ghost"
                                  size="sm"
                                  icon="leading"
                                  iconOnly
                                  iconName="dots-three-vertical"
                                  aria-expanded={rowKebabOpenIndex === index}
                                  aria-haspopup="menu"
                                  disabled={rowCompleted}
                                  onClick={() =>
                                    rowCompleted
                                      ? undefined
                                      : setRowKebabOpenIndex((open) =>
                                          open === index ? null : index,
                                        )
                                  }
                                />
                                {rowKebabOpenIndex === index && !rowCompleted ? (
                                  <div
                                    role="menu"
                                    aria-label="Change request actions"
                                    style={{
                                      position: 'absolute',
                                      top: 'calc(100% + 4px)',
                                      right: 0,
                                      zIndex: 20,
                                      minWidth: 200,
                                      background: '#ffffff',
                                      border: '1px solid #e4ddd3',
                                      borderRadius: 8,
                                      boxShadow: '0 2px 8px rgba(41,33,28,0.12)',
                                      padding: '4px 0',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full border-0 bg-transparent text-left text-[13px] font-normal text-[#2e1c1c] cursor-pointer hover:bg-[#f3efe9]"
                                      style={{ padding: '8px 12px' }}
                                      onClick={() => {
                                        setRowKebabOpenIndex(null);
                                        cr.onRowKebabClick?.();
                                      }}
                                    >
                                      {cr.rowKebabLabel ?? 'Mark as completed'}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : hasChangeRequests ? (
          <div className={styles.changeRequestsBody}>
            {changeRequests.map((cr, index) => {
              const rowCompleted = Boolean(cr.completed);
              return (
              <div key={`${cr.changeNumber}-${index}`} className={styles.changeRequestBlock}>
                {index > 0 ? <Divider className={styles.changeRequestDivider} /> : null}
                <div className={styles.changeRequestItem}>
                  <div className={styles.changeRequestRow}>
                    <p
                      className={[
                        styles.changeRequestText,
                        rowCompleted ? styles.changeRequestTextCompleted : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {cr.changesNeeded || 'Change requested.'}
                    </p>
                    <Tag
                      variant={rowCompleted ? 'neutral' : 'butter'}
                      size="sm"
                      label={`Change ${cr.changeNumber}`}
                      className={styles.changeRequestTag}
                    />
                  </div>
                  {cr.artifactNames.length > 0 ? (
                    <div className={styles.tagsRow}>
                      {cr.artifactNames.map((name, tagIndex) => (
                        <Tag
                          key={`${cr.changeNumber}-artifact-${tagIndex}`}
                          label={name}
                          variant={rowCompleted ? 'neutral' : 'brand'}
                          size="sm"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
            })}
          </div>
        ) : (
          <>
            {textOk ? (
              <p
                className={[
                  styles.decisionText,
                  isPreferenceAmended ? styles.decisionTextAmended : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {decisionText}
              </p>
            ) : null}
            {tagsOk ? (
              <div className={styles.tagsRow}>
                {footerTags.map((label, index) =>
                  renderArtifactTag(
                    label,
                    superseded || isPreferenceAmended
                      ? 'neutral'
                      : isPreferenceVariant
                        ? 'aqua'
                        : 'brand',
                    `${label}-${index}`,
                  ),
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
  );

  if (isPreferenceAmended) {
    return (
      <Tooltip label="This preference has been amended." fullWidth>
        {cardArticle}
      </Tooltip>
    );
  }

  return cardArticle;
}
