'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Icon } from './Icon';
import { Tag, type TagVariant } from './Tag';
import { Tooltip } from './Tooltip';
import { avatarColourKey, getAvatarInlineStyle } from '@/lib/utils/avatarColour';
import styles from './CommentThread.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
// DLS node 55:235 — 6 variants:
//
// type="feedback"          stakeholder=true  feedbackStatus="Submitted"
//   White card. Avatar + name + timestamp + "Feedback" tag. Body text.
//   Option tag(s). Reply input + Send button.
//
// type="with-reply"        stakeholder=true  feedbackStatus="Reply"
//   White card. Same header. Body text. Option tag(s).
//   Reply block (recessed bg, drill-down icon, reply text + replier details).
//   Reply input + Send button.
//
// type="no-feedback"       stakeholder=false feedbackStatus="Empty"
//   White card. Avatar + name + "Feedback required" label + blocked icon.
//   No body. No reply input.
//
// type="decision-required" stakeholder=false feedbackStatus="Empty"
//   Yellow card. Avatar + name + "Decision Required" label + blocked icon.
//   No body. No reply input. (non-stakeholder view)
//
// type="decision-required" stakeholder=true  feedbackStatus="Empty"
//   Yellow card. Avatar + name + "Decision Required" label + blocked icon.
//   Full-width "Make Decision" primary button.
//
// type="decision"          stakeholder=true  feedbackStatus="Empty"
//   Lilac card. Avatar + name + timestamp + "Decision" success tag.
//   Body text. Option tag(s) in butter style. Reply input + Send button.

export type CommentThreadType =
  | 'feedback'
  | 'with-reply'
  | 'no-feedback'
  | 'decision-required'
  | 'decision';

export interface CommentReply {
  body: string;
  authorName: string;
  authorAvatarSrc?: string;
  timestamp: string;
}

export interface CommentOption {
  label: string;
}

export interface CommentThreadProps {
  type: CommentThreadType;
  /** Whether the current user is the stakeholder/decision-maker for this thread */
  isStakeholder?: boolean;
  authorName: string;
  authorAvatarSrc?: string;
  /** Contributor id for deterministic avatar colour. */
  authorContributorId?: string;
  /** Reviewer email — preferred avatar colour key (with authorContributorId). */
  authorEmail?: string | null;
  timestamp?: string;
  body?: string;
  /** Option/artifact tags shown below the body */
  options?: CommentOption[];
  /** Tag styling for option/artifact chips (compare preferred option uses aqua). */
  optionTagVariant?: TagVariant;
  /** Nested reply — shown in with-reply type */
  reply?: CommentReply;
  replies?: Array<{
    text: string;
    authorName: string;
    authorInitials: string;
    timestamp: string;
    authorContributorId?: string;
  }>;
  cardCategory?: 'feedback' | 'change_request' | 'notification';
  /** Called when user submits a reply */
  onReply?: (text: string) => void;
  /** Called when "Make Decision" button is clicked */
  onMakeDecision?: () => void;
  /** Tooltip text shown on feedback-required info icon */
  statusInfoTooltip?: string;
  className?: string;
}

export function CommentThread({
  type,
  isStakeholder = true,
  authorName,
  authorAvatarSrc,
  authorContributorId,
  authorEmail,
  timestamp,
  body,
  options = [],
  optionTagVariant = 'brand',
  reply,
  replies = [],
  onReply,
  onMakeDecision,
  statusInfoTooltip,
  cardCategory,
  className,
}: CommentThreadProps) {
  const [replyText, setReplyText] = useState('');
  const [replyFocused, setReplyFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 64)}px`;
    el.style.overflowY = el.scrollHeight > 64 ? 'auto' : 'hidden';
  }, [replyText]);

  const handleSend = () => {
    if (!replyText.trim()) return;
    onReply?.(replyText.trim());
    setReplyText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Determine root styles based on type ──────────────────────────────────
  const isDecisionRequired = type === 'decision-required';
  const isDecision = type === 'decision';
  const isNoFeedback = type === 'no-feedback';
  const isFeedback = type === 'feedback';
  const isWithReply = type === 'with-reply';
  const effectiveCategory =
    cardCategory ??
    (isNoFeedback || isDecisionRequired ? 'notification' : 'feedback');

  const rootClass = [
    styles.root,
    isDecisionRequired ? styles.rootWarning : '',
    isDecision ? styles.rootLilac : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  const headerColourKey = avatarColourKey(authorEmail, authorContributorId);
  const headerAvatarStyle = getAvatarInlineStyle(headerColourKey, {
    ring: isDecisionRequired || isDecision,
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <article className={rootClass}>

      {/* ── Header row ── */}
      <div className={styles.header}>
        {/* Avatar */}
        <Avatar
          src={authorAvatarSrc}
          name={authorName}
          contributorId={authorContributorId}
          size="md"
          style={headerAvatarStyle}
        />

        {/* Name + timestamp (feedback, with-reply, decision) */}
        {(isFeedback || isWithReply || isDecision) && (
          <>
            <span className={styles.authorName}>{authorName}</span>
            {timestamp && <span className={styles.dot}>·</span>}
            {timestamp && <span className={styles.timestamp}>{timestamp}</span>}
            {/* Type tag — right side */}
            {isFeedback || isWithReply ? (
              <Tag label="Feedback" variant="neutral" size="sm" />
            ) : isDecision ? (
              <Tag label="Decision" variant="success" size="sm" />
            ) : null}
          </>
        )}

        {/* Name + status label (no-feedback, decision-required) */}
        {(isNoFeedback || isDecisionRequired) && (
          <>
            <span className={styles.authorNameFull}>{authorName}</span>
            <span className={isDecisionRequired ? styles.statusLabelWarning : styles.statusLabel}>
              {isDecisionRequired ? 'Decision Required' : 'Feedback required'}
            </span>
            {statusInfoTooltip ? (
              <Tooltip label={statusInfoTooltip} position="top">
                <span
                  className={styles.blockedIcon}
                  aria-label={statusInfoTooltip}
                  style={{ color: '#7a5500' }}
                >
                  <Icon name="status-blocked" size={16} />
                </span>
              </Tooltip>
            ) : (
              <span
                className={styles.blockedIcon}
                aria-hidden="true"
                style={{ color: '#7a5500' }}
              >
                <Icon name="status-blocked" size={16} />
              </span>
            )}
          </>
        )}
      </div>

      {/* ── Body text ── */}
      {body && (isFeedback || isWithReply || isDecision) && (
        <p className={styles.body}>{body}</p>
      )}

      {/* ── Option tags ── */}
      {options.length > 0 && (isFeedback || isWithReply || isDecision) && (
        <div className={styles.options}>
          {options.map((opt, i) => {
            const tag = (
              <Tag label={opt.label} variant={optionTagVariant} size="sm" />
            );
            if (optionTagVariant === 'aqua') {
              return (
                <Tooltip key={i} label="Preferred Option" position="top">
                  <span className="inline-flex">{tag}</span>
                </Tooltip>
              );
            }
            return <span key={i} className="inline-flex">{tag}</span>;
          })}
        </div>
      )}

      {/* ── Nested reply blocks ── */}
      {(replies.length > 0 || (isWithReply && reply)) && (
        <div className="flex flex-col gap-[10px]">
          {replies.map((entry, idx) => (
            <div
              key={`${entry.authorName}-${entry.timestamp}-${idx}`}
              className="rounded-[4px] bg-[#f3efe9] p-3 flex gap-[10px] items-start"
            >
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Avatar
                    name={entry.authorName}
                    contributorId={entry.authorContributorId}
                    size="md"
                    style={getAvatarInlineStyle(
                      entry.authorContributorId ?? entry.authorName,
                      { ring: true },
                    )}
                  />
                  <span className="text-[13px] font-medium text-[#6b5e55]">{entry.authorName}</span>
                  <span className="text-[12px] text-[#998c82]">·</span>
                  <span className="text-[12px] text-[#998c82]">{entry.timestamp}</span>
                </div>
                <p className="text-[13px] text-[#2e1c1c] break-words m-0">{entry.text}</p>
              </div>
            </div>
          ))}
          {isWithReply && reply && (
            <div className="rounded-[4px] bg-[#f3efe9] p-3 flex gap-[10px] items-start">
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Avatar
                    src={reply.authorAvatarSrc}
                    name={reply.authorName}
                    size="md"
                    style={getAvatarInlineStyle(reply.authorName, { ring: true })}
                  />
                  <span className="text-[13px] font-medium text-[#6b5e55]">{reply.authorName}</span>
                  <span className="text-[12px] text-[#998c82]">·</span>
                  <span className="text-[12px] text-[#998c82]">{reply.timestamp}</span>
                </div>
                <p className="text-[13px] text-[#2e1c1c] break-words m-0">{reply.body}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Reply input row (feedback, with-reply, decision) ── */}
      {(isFeedback || isWithReply || isDecision || effectiveCategory === 'change_request') &&
        onReply && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className={styles.replyRow} style={{ alignItems: 'flex-start' }}>
            <textarea
              ref={textareaRef}
              className={`${styles.replyInput} placeholder:text-[#998c82]`}
              placeholder="Reply..."
              value={replyText}
              maxLength={140}
              rows={1}
              style={{
                resize: 'none',
                overflow: 'hidden',
                minHeight: 32,
                maxHeight: 64,
                width: '100%',
                fontSize: 13,
                padding: '6px 8px',
                border: '1px solid #e4ddd3',
                borderRadius: 6,
                backgroundColor: 'white',
                fontFamily: 'inherit',
                color: '#2e1c1c',
              }}
              onChange={e => setReplyText(e.target.value.slice(0, 140))}
              onFocus={() => setReplyFocused(true)}
              onBlur={() => setReplyFocused(false)}
              onKeyDown={handleKeyDown}
              aria-label="Write a reply"
            />
            <Button
              variant="secondary"
              size="sm"
              label="Send"
              onClick={handleSend}
              disabled={!replyText.trim()}
            />
          </div>
          {replyFocused && (
            <span style={{ fontSize: 12, color: '#6b5e55' }}>{`${replyText.length}/140 characters`}</span>
          )}
        </div>
      )}

      {/* ── Make Decision button (decision-required + stakeholder) ── */}
      {isDecisionRequired && isStakeholder && (
        <Button
          variant="primary"
          size="sm"
          label="Make Decision"
          onClick={onMakeDecision}
          className={styles.makeDecisionBtn}
        />
      )}

    </article>
  );
}
