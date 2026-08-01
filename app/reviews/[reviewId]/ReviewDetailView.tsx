'use client';

/**
 * Review Detail view (client)
 *
 * Receives the real review record from the server component at
 * `app/reviews/[reviewId]/page.tsx`. Core review fields come from Supabase;
 * some sections still support local additions (e.g. tradeoffs beyond jsonb).
 *
 * Modes:
 *   - "edit"        designer view (inputs / add / remove)
 *   - "view-only"   stakeholder view (readonly, can still comment)
 *
 * RHC (right-hand column) open state is persisted globally under
 * the localStorage key `designtrace_rhc_open` and reapplied on every
 * review detail page load.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type LegacyRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArtifactPreview,
  Alert,
  Avatar,
  Button,
  Checkbox,
  CommentThread,
  DecisionCard,
  Icon,
  Input,
  Menu,
  MenuItem,
  Modal,
  NotificationBadge,
  PageHeader,
  Select,
  StatusPill,
  Tag,
  Textarea,
  Tooltip,
  TradeoffCard,
  type ArtifactDescriptionState,
} from '@/components/ui/ds';
import notificationBadgeStyles from '@/components/ui/ds/NotificationBadge.module.css';
import type {
  CommentThreadType,
  MenuSectionsReviewer,
  MenuSectionsState,
  StatusPillColor,
} from '@/components/ui/ds';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatDistanceToNowShort } from '@/lib/formatDistanceToNow';
import { useClientRelativeTime } from '@/lib/hooks/useClientRelativeTime';
import {
  normalizeWorkspacePermission,
} from '@/lib/workspace/permissions';
import { useActiveWorkspacePermission } from '@/hooks/useWorkspacePermission';
import { formatAccessRequestSentTooltip } from '@/lib/accessRequests/formatAccessRequestSentTooltip';
import { loadReviewPendingAccessRequestSummary } from '@/lib/accessRequests/loadPendingAccessRequestSummaries';
import { loadPendingAccessRequestClient } from '@/lib/accessRequests/loadPendingAccessRequest';
import { submitAccessRequestClient } from '@/lib/accessRequests/submitAccessRequestClient';
import { AccessRequestPendingPill } from '@/components/accessRequests/AccessRequestPendingPill';
import { normalizeReviewStatusKey } from '@/lib/reviews/reviewStatusDisplay';
import {
  canAddTradeoff,
  canEditReviewDetails,
  canMakeDecision,
  canSubmitFeedback as canSubmitFeedbackByRole,
  canUseViewOnlyReviewMode,
  getDecisionMakerReviewerId,
  getPrimaryFeedbackCta,
  getReviewerDisplayState,
  hasAllReviewerFeedbackSubmitted,
} from '@/lib/reviews/workflow';
import {
  archiveReviewStubAction,
  assignReviewersAction,
  createTeammateFromReviewAction,
  deleteReviewAction,
  markChangeRequestsCompletedAction,
  markCompleteAction,
  reopenChangeRequestsAction,
  removeReviewerAction,
  publishReviewAction,
  reopenReviewAction,
  saveReviewFocusAction,
  submitReplyAction,
  updateReviewLifecycleStatusAction,
} from './actions';
import { contactNameFromMap } from '@/lib/contacts/fetchContactDisplayNames';
import { FixedToastPortal } from '@/components/FixedToastPortal';
import { useToast } from '@/components/Toast';
import { getActiveWorkspaceId } from '@/lib/workspace/activeWorkspace';
import { sendWorkspaceInvite } from '@/lib/workspace/invite-client';
import { inviteToastMessage } from '@/lib/workspace/invite-toast';
import { AddReviewerDropdown } from './AddReviewerDropdown';
import { useWorkspaceReviewerPickerOptions } from './useWorkspaceReviewerPickerOptions';
import { SubmitFeedbackDrawer } from './SubmitFeedbackDrawer';
import { ActivityTab } from './ActivityTab';
import { EditReviewDrawer } from './EditReviewDrawer';
import { EditReviewTypeModal } from './EditReviewTypeModal';
import { FinalDecisionDrawer } from '@/components/FinalDecisionDrawer';
import modalStyles from '@/components/ui/ds/Modal.module.css';
import { generateArtifactDescription } from '@/app/actions/generateArtifactDescription';
import { logTimelineEventClient } from '@/lib/timeline/logEventClient';
import { buildChangeRequestLabelById } from '@/lib/reviews/changeRequestLabels';
import { artifactIdsWithReceivedFeedback } from '@/lib/reviews/artifactFeedback';
import {
  artifactChipHref,
  resolveArtifactOpenTarget,
} from '@/lib/artifacts/artifactOpenTarget';
import {
  changeRequestMatchesSelection,
  expandArtifactSelectionKeys,
} from '@/lib/reviews/artifactSelectionMatch';
import { canDeleteReview } from '@/lib/reviews/reviewDeleteEligibility';
import {
  COMPLETABLE_STATUSES,
  manualReviewStatusMenuOptions,
  reopenReviewStatusForType,
  resolveReviewStatusPill,
} from '@/lib/reviews/reviewStatusDisplay';
import { getAvatarInlineStyle, avatarColourKey } from '@/lib/utils/avatarColour';
import { resolveArtifactPreviewFileType } from '@/lib/artifacts/resolveArtifactPreviewFileType';
import { ArtifactSnapshotLightbox } from '@/components/reviews/ArtifactSnapshotLightbox';
import { Warning } from 'phosphor-react';

/** Toast after the remind API successfully emails pending reviewers. */
const REMINDER_SUCCESS_TOAST =
  'Reminders sent — all pending reviewers have been notified.';

/** Open reviewers may request review access only in these statuses. */
const REQUEST_TO_REVIEW_VISIBLE_STATUSES = new Set([
  'in-review',
  'needs-changes',
  'changes-needed',
  'feedback-submitted',
  'paused',
]);

//  Types 

type ReviewMode = 'edit' | 'view-only';

export interface ReviewArtifact {
  id: string;
  label: string;
  title: string | null;
  /** Raw upload filename from artifacts jsonb (for display when title is empty). */
  originalFileName: string | null;
  /** Canonical `artifacts.id` when known from `artifact_versions`. */
  canonicalArtifactId?: string | null;
  type: 'Figma' | 'PDF' | 'Image';
  iteration: string;
  description: string;
  /** Direct file URL for image / PDF previews. */
  imageUrl: string | null;
  /** Original link (Figma etc.) used to drive the embed iframe. */
  linkUrl: string | null;
  mimeType?: string | null;
  /** Captured Figma PNG URL from `artifacts.snapshot_url`. */
  snapshotUrl?: string | null;
  /** When the snapshot was captured (`artifacts.snapshot_captured_at`). */
  snapshotCapturedAt?: string | null;
  /** Client-only AI description UX (not persisted). */
  descriptionAiState?: ArtifactDescriptionState;
  aiGenerated?: boolean;
}

export interface Problem {
  id: string;
  text: string;
  selected: boolean;
}

export interface Tradeoff {
  id: string;
  label: string;
  severity: 'High' | 'Medium' | 'Low';
  relatedArtifactIds?: string[];
  /** Optional label from create-flow / AI jsonb (`artifactLabel`). */
  artifactLabel?: string;
  /** Contributor who added this tradeoff on the review detail page. */
  createdByContributorId?: string | null;
}

interface Reviewer {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  variant: 'lilac' | 'default';
  isDecisionMaker: boolean;
}
export interface ReviewerAssignment {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  isDecisionMaker: boolean;
  userId?: string | null;
}
interface ContributorOption {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  userId?: string;
}

interface Reply {
  id: string;
  text: string;
  author: string;
  timestamp: string;
}

/**
 * Local shape for the mocked feedback list until `reviewer_feedback` lands.
 * (Renamed from `CommentThread` to avoid collision with the DS
 * `CommentThread` component exported from `@/components/ui/ds`.)
 */
interface FeedbackThread {
  id: string;
  reviewerId: string;
  author: string;
  authorEmail?: string | null;
  authorAvatarSrc?: string;
  timestamp: string;
  /** ISO timestamp for client-only relative display (avoids SSR hydration mismatch). */
  submittedAtIso?: string | null;
  type: 'Feedback' | 'Decision' | 'Question';
  text?: string;
  optionTag?: string;
  /** Resolved concept labels (one per selected option) for individual tags. */
  optionTags?: string[];
  replies?: Reply[];
  /**
   * - 'pending'            reviewer hasn't submitted yet
   * - 'submitted'          feedback captured
   * - 'decision-required'  this reviewer is the decision-maker and must decide next
   */
  status: 'submitted' | 'pending' | 'decision-required';
  requestedAt?: string | null;
}

export interface ReviewerFeedbackEntry {
  feedbackId: string | null;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: string;
  status: 'submitted' | 'pending' | 'decision-required';
  feedbackText: string | null;
  selectedOption: string | null;
  /** From `reviewer_feedback.feedback_kind` when present. */
  feedbackKind: 'approval' | 'change-request' | 'mixed' | 'generic' | null;
  /** Contributor who submitted this row (may differ from reviewer when submitted on behalf). */
  submittedById: string | null;
  submittedByName?: string | null;
  submittedAt: string | null;
  replyText: string | null;
  replyById: string | null;
  replyAt: string | null;
  requestedAt: string | null;
}

export interface ReviewChangeRequestEntry {
  id: string;
  reviewer_id: string | null;
  artifact_ids: string[];
  changes_needed: string | null;
  reply_text: string | null;
  reply_by_id: string | null;
  reply_at: string | null;
  created_at: string;
  batch_id: string | null;
  batch_number: number | null;
  reviewer_feedback_id: string | null;
  change_number: number | null;
  completed_at: string | null;
  completed_by_id: string | null;
  /** Joined from `contributors` when loading change_requests. */
  reviewer_name?: string | null;
}

/** Row from `card_replies` (append-only thread replies). */
export interface CardReplyRow {
  id: string;
  card_type: 'feedback' | 'change_request';
  card_id: string;
  reply_text: string;
  reply_by_id: string | null;
  /** Resolved display name of the replier (server-side), independent of the client contributor list. */
  reply_by_name: string | null;
  created_at: string;
}

type DecisionData = {
  status: string | null;
  text: string | null;
  madeAt: string | null;
  ownerId?: string | null;
  selectedArtifactIds?: string[];
  tradeOffNote?: string | null;
  tradeOffIsAI?: boolean | null;
};

export interface ReviewDecisionSnapshotEntry {
  id: string;
  decision_status: string;
  decision_comments: string | null;
  decision_selected_artifact_ids: string[];
  decision_owner_id: string | null;
  decision_made_at: string;
  superseded_at: string | null;
  entry_role: 'approval' | 'change_request';
}

export interface ReviewDetailViewProps {
  reviewId: string;
  title: string;
  /** DB-normalized status (e.g. 'in-review', 'approved', 'needs-changes', 'blocked', 'draft', 'closed'). */
  status: string;
  reviewType: string;
  reviewFocus: string;
  projectId: string;
  projectName: string;
  /** Parent project lifecycle status (active | paused | complete). */
  projectStatus?: string | null;
  mode: ReviewMode;
  /** Real artifacts parsed from the `reviews.artifacts` jsonb column. */
  artifacts: ReviewArtifact[];
  /** Project problems, pre-flagged with `selected` for members of `related_problem_ids`. */
  problems: Problem[];
  contributors: ContributorOption[];
  assignedReviewers: ReviewerAssignment[];
  feedbackEntries: ReviewerFeedbackEntry[];
  /** All `reviewer_feedback` rows (history); `feedbackEntries` is latest per reviewer only. */
  allFeedbackRows?: ReviewerFeedbackEntry[];
  changeRequests: ReviewChangeRequestEntry[];
  cardReplies: CardReplyRow[];
  currentContributorId: string | null;
  currentContributorRole: string | null;
  /** From `contributors.permission_level` for the effective viewer (e.g. editor, admin, reviewer). */
  currentContributorPermissionLevel?: string | null;
  /** From `workspace_members.permission_level` for the signed-in auth user. */
  workspacePermissionLevel?: string | null;
  currentAuthUserId?: string | null;
  /** `reviews.creator_id` → auth.users(id). */
  reviewCreatorAuthUserId?: string | null;
  requireDecisionMaker: boolean;
  decisionMakerId?: string | null;
  /** Contributor id → display name via `contact_names`. */
  contactDisplayById?: Record<string, string>;
  decision: DecisionData;
  /** Historical final decision snapshots (compare direction changes). */
  decisionSnapshots?: ReviewDecisionSnapshotEntry[];
  reviewOwnerName: string | null;
  lastReminderSentAt?: string | null;
  reviewCreatedAt?: string | null;
  reviewUpdatedAt?: string | null;
  activeTabIndex?: number;
  /** Tradeoffs from `reviews.tradeoffs` jsonb (e.g. create-review AI). */
  tradeoffs?: Tradeoff[];
}

//  Mock fallbacks (fields not yet in the database) 
// Reviewers and feedback wiring: see `reviewer_feedback` migrations. Tradeoffs
// may load from `reviews.tradeoffs` and can still be extended via inline forms.

interface DecisionSummary {
  pillColor: StatusPillColor;
  pillLabel: string;
  options: string[];
  decisionText: string;
  ownerName: string;
  ownerAvatarSrc?: string;
  recordedAtIso: string | null;
  tradeOffNote?: string;
  tradeOffIsAI?: boolean;
}

const MOCK_DECISION: DecisionSummary | null = null;

/**
 * Map a `FeedbackThread` to the DS `CommentThreadType` variant.
 * Feedback cards keep default styling; decision styling is reserved for the Decision Log.
 */
function getCommentType(thread: FeedbackThread, hasCardReplies: boolean): CommentThreadType {
  if (thread.replies && thread.replies.length > 0) return 'with-reply';
  if (hasCardReplies) return 'with-reply';
  if (thread.status === 'pending') return 'no-feedback';
  return 'feedback';
}

//  Colour tokens (raw hex, no escaping) 

const COLOURS = {
  pageBg: '#faf8f6',
  surfaceCard: '#ffffff',
  surfaceRecessed: '#f3efe9',
  borderSubtle: '#ede8e0',
  borderDefault: '#e4ddd3',
  textHeading: '#6b1e2e',
  textPrimary: '#2e1c1c',
  textSecondary: '#6b5e55',
  textTertiary: '#998c82',
  brandBg: '#f5eaec',
  brandBorder: '#e8d0d4',
  brandText: '#6b1e2e',
  lilacBg: '#f5e8f6',
  lilacBorder: '#d9a8dc',
  sevHighBg: '#fceaea',
  sevHighBorder: '#e07070',
  sevMedBg: '#fef8dc',
  sevMedBorder: '#e5b025',
  sevLowBg: '#edf7ed',
  sevLowBorder: '#5aaa5a',
  pendingText: '#7a5500',
} as const;

const RHC_OPEN_WIDTH = 'clamp(360px, 34vw, 440px)';
const RHC_CLOSED_WIDTH = 48;
const RHC_STORAGE_KEY = 'designtrace_rhc_open';
const RHC_COMPACT_BREAKPOINT = '(min-width: 1024px)';

// All top-level sections in the main scroll area (order matches layout).
const NAV_SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'review-focus', label: 'Details' },
  { id: 'designs', label: 'Designs' },
  { id: 'problems', label: 'Problems' },
  { id: 'tradeoffs', label: 'Tradeoffs & Risks' },
  { id: 'reviewers', label: 'Reviewers' },
];

function avatarInlinePaletteStyle(
  email?: string | null,
  contributorId?: string | null,
  ring = false,
) {
  return getAvatarInlineStyle(avatarColourKey(email, contributorId), { ring });
}

function reviewerAvatarProps(
  email?: string | null,
  contributorId?: string | null,
  ring = false,
) {
  const colourKey = avatarColourKey(email, contributorId);
  const id = (contributorId ?? '').trim() || colourKey;
  return {
    contributorId: id,
    style: getAvatarInlineStyle(colourKey, { ring }),
  };
}

function reviewerAvatarPropsForContributorId(
  contributorId: string | null | undefined,
  contributorsById: Map<string, ContributorOption>,
  reviewersById: Map<string, ReviewerAssignment>,
  ring = false,
) {
  const id = (contributorId ?? '').trim();
  const email =
    contributorsById.get(id)?.email ?? reviewersById.get(id)?.email ?? null;
  return reviewerAvatarProps(email, id || null, ring);
}

function contributorEmailById(
  contributorId: string | null | undefined,
  contributorsById: Map<string, ContributorOption>,
  reviewersById: Map<string, ReviewerAssignment>,
): string | null {
  const id = (contributorId ?? '').trim();
  if (!id) return null;
  return contributorsById.get(id)?.email ?? reviewersById.get(id)?.email ?? null;
}

function normStatus(raw: string | null | undefined) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

function formatReviewerNamesForSentence(names: string[]) {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  if (cleaned.length === 0) return 'reviewer';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned.at(-1)}`;
}

function reviewerChipVariantForType(
  isDecisionMaker: boolean,
  normalizedReviewType: string,
): 'lilac' | 'default' {
  return normalizedReviewType === 'compare' && isDecisionMaker ? 'lilac' : 'default';
}

function artifactSelectionKey(artifact: ReviewArtifact) {
  const title = artifact.title?.trim() ?? '';
  return title !== '' ? title : artifact.id;
}

function reviewerNameForChangeRequest(
  cr: ReviewChangeRequestEntry,
  reviewersById: Map<string, ReviewerAssignment>,
  contributorsById: Map<string, ContributorOption>,
): string {
  const joined = cr.reviewer_name?.trim();
  if (joined) return joined;
  const reviewerId = String(cr.reviewer_id ?? '').trim();
  if (!reviewerId) return 'Reviewer';
  return (
    reviewersById.get(reviewerId)?.name ??
    contributorsById.get(reviewerId)?.name ??
    'Reviewer'
  );
}

function labelsForArtifactSelectionKeys(
  selectedKeys: string[],
  artifacts: ReviewArtifact[],
) {
  return selectedKeys.map((key) => {
    const match = artifacts.find(
      (artifact) => artifactSelectionKey(artifact) === key || artifact.id === key,
    );
    return match?.label ?? match?.title ?? key;
  });
}

/** One tag label per selected concept — never a comma-joined string. */
function conceptLabelsFromSelection(
  selectedOption: string | null | undefined,
  artifacts: ReviewArtifact[],
): string[] {
  if (!selectedOption) return [];
  const keys = selectedOption
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (keys.length === 0) return [];
  return labelsForArtifactSelectionKeys(keys, artifacts ?? []);
}

function resolveThreadConceptOptions(
  thread: FeedbackThread,
  artifacts: ReviewArtifact[],
): { label: string }[] {
  const safeArtifacts = artifacts ?? [];
  const sourceLabels =
    thread.optionTags && thread.optionTags.length > 0
      ? thread.optionTags
      : conceptLabelsFromSelection(thread.optionTag, safeArtifacts);
  return sourceLabels
    .flatMap((label) => {
      const labelText = String(label ?? '').trim();
      if (!labelText) return [];
      const parts = labelText
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      return parts.length > 1 ? parts : [labelText];
    })
    .filter(Boolean)
    .map((label) => ({ label }));
}

function formatDecisionCardTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

function decisionCardStatusFromReviewDecision(
  decisionStatus: string | null | undefined,
): 'approved' | 'changes-needed' {
  const normalized = normStatus(decisionStatus);
  return normalized === 'approved' ? 'approved' : 'changes-needed';
}

function formatCompareFinalDecisionSummary(
  dmName: string,
  conceptLabels: string[],
  hasChangeRequests: boolean,
): string {
  const concepts =
    conceptLabels.length > 0
      ? conceptLabels.join(', ')
      : 'the selected direction';
  if (hasChangeRequests) {
    return `${dmName} approved ${concepts} as the final direction with changes.`;
  }
  return `${dmName} approved ${concepts} as the final direction.`;
}

function canManageChangeRequestEntry(
  cr: ReviewChangeRequestEntry,
  currentContributorId: string | null,
  isReviewCreator: boolean,
  canEditCoreDetails: boolean,
): boolean {
  const reviewerId = String(cr.reviewer_id ?? '').trim();
  return (
    Boolean(currentContributorId && reviewerId === currentContributorId) ||
    isReviewCreator ||
    canEditCoreDetails
  );
}

export type ApproveRhcReviewerEntry = {
  reviewerId: string;
  reviewerName: string;
  reviewerEmail?: string | null;
  status: ReviewerFeedbackEntry['status'];
  feedbackKind: 'approval' | 'change-request';
  isResubmission: boolean;
};

function isApproveFeedbackResubmission(
  entry: ReviewerFeedbackEntry,
  allEntries: ReviewerFeedbackEntry[],
): boolean {
  const submittedForReviewer = allEntries.filter(
    (row) => row.reviewerId === entry.reviewerId && row.status === 'submitted',
  );
  if (submittedForReviewer.length <= 1) return false;
  const sorted = [...submittedForReviewer].sort(
    (a, b) =>
      new Date(String(a.submittedAt ?? 0)).getTime() -
      new Date(String(b.submittedAt ?? 0)).getTime(),
  );
  const index = sorted.findIndex(
    (row) =>
      (entry.feedbackId && row.feedbackId === entry.feedbackId) ||
      row.submittedAt === entry.submittedAt,
  );
  return index > 0;
}

function toApproveRhcFeedbackKind(
  storedKind: ReviewerFeedbackEntry['feedbackKind'],
  entryStatus: ReviewerFeedbackEntry['status'],
  hasChangeRequests: boolean,
): ApproveRhcReviewerEntry['feedbackKind'] {
  if (storedKind === 'change-request' || storedKind === 'mixed') {
    return 'change-request';
  }
  if (storedKind === 'approval') {
    return 'approval';
  }
  return entryStatus === 'submitted' && hasChangeRequests ? 'change-request' : 'approval';
}

function buildApproveRhcReviewerEntries(
  reviewerIds: string[],
  resolvedEntries: ReviewerFeedbackEntry[],
  changeRequests: ReviewChangeRequestEntry[],
  allFeedbackRows: ReviewerFeedbackEntry[],
  emailByReviewerId?: Map<string, string | null>,
): ApproveRhcReviewerEntry[] {
  const changeRequestReviewerIds = new Set(
    changeRequests
      .map((request) => request.reviewer_id)
      .filter((id): id is string => Boolean(id)),
  );
  const entryByReviewerId = new Map(
    resolvedEntries.map((entry) => [entry.reviewerId, entry] as const),
  );

  return reviewerIds.map((reviewerId) => {
    const entry = entryByReviewerId.get(reviewerId) ?? {
      feedbackId: null,
      reviewerId,
      reviewerName: 'Reviewer',
      reviewerRole: '',
      status: 'pending' as const,
      feedbackText: null,
      selectedOption: null,
      feedbackKind: null,
      submittedById: null,
      submittedAt: null,
      replyText: null,
      replyById: null,
      replyAt: null,
      requestedAt: null,
    };
    const hasChangeRequests = changeRequestReviewerIds.has(reviewerId);
    const feedbackKind = toApproveRhcFeedbackKind(
      entry.feedbackKind,
      entry.status,
      hasChangeRequests,
    );
    return {
      reviewerId,
      reviewerName: entry.reviewerName,
      reviewerEmail: emailByReviewerId?.get(reviewerId) ?? null,
      status: entry.status,
      feedbackKind,
      isResubmission: isApproveFeedbackResubmission(entry, allFeedbackRows),
    };
  });
}

function formatDecisionLogDateHeader(iso: string | null | undefined): string {
  if (!iso) return 'Approval';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Approval';
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function decisionLogLocalDateKey(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA');
}

function groupDecisionLogEntriesByDate(entries: ReviewerFeedbackEntry[]) {
  const groups: Array<{ dateLabel: string; entries: ReviewerFeedbackEntry[] }> = [];
  for (const entry of entries) {
    const dateLabel = formatDecisionLogDateHeader(entry.submittedAt);
    const last = groups[groups.length - 1];
    if (last && last.dateLabel === dateLabel) {
      last.entries.push(entry);
    } else {
      groups.push({ dateLabel, entries: [entry] });
    }
  }
  return groups;
}

function ApproveRhcReviewerPendingCard({
  reviewerName,
  reviewerId,
  reviewerEmail,
}: {
  reviewerName: string;
  reviewerId: string;
  reviewerEmail?: string | null;
}) {
  const colourKey = avatarColourKey(reviewerEmail, reviewerId);
  return (
    <div
      className="flex w-full flex-row items-center gap-2 rounded-[8px] border border-solid border-[#e4ddd3] bg-white"
      style={{ padding: '12px 16px' }}
    >
      <Avatar
        name={reviewerName}
        contributorId={reviewerId}
        size="md"
        style={getAvatarInlineStyle(colourKey, { ring: true })}
      />
      <span
        className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#2e1c1c]"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {reviewerName}
      </span>
      <span
        className="shrink-0 text-[12px] font-normal text-[#7a5500]"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        Feedback required
      </span>
      <Icon name="status-blocked" size={16} style={{ color: '#7a5500', flexShrink: 0 }} />
    </div>
  );
}

function ApproveRhcReviewerReceivedCard({
  reviewerName,
  reviewerId,
  reviewerEmail,
  isResubmission,
}: {
  reviewerName: string;
  reviewerId: string;
  reviewerEmail?: string | null;
  isResubmission: boolean;
}) {
  const label = isResubmission ? 'Feedback re-submitted' : 'Feedback received';
  const colourKey = avatarColourKey(reviewerEmail, reviewerId);
  return (
    <div
      className="flex w-full flex-row items-center gap-2 rounded-[8px] border border-solid border-[#e4ddd3] bg-white"
      style={{ padding: '12px 16px' }}
    >
      <Avatar
        name={reviewerName}
        contributorId={reviewerId}
        size="md"
        style={getAvatarInlineStyle(colourKey, { ring: true })}
      />
      <span
        className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#2e1c1c]"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {reviewerName}
      </span>
      <span
        className="shrink-0 text-[12px] font-normal text-[#256b38]"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {label}
      </span>
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3b9b54]"
        aria-hidden
      >
        <Icon name="check" size={14} style={{ color: '#ffffff' }} />
      </span>
    </div>
  );
}

function isCompleteLifecycle(raw: string, reviewTypeNorm?: string) {
  const k = normStatus(raw);
  const rt = normStatus(reviewTypeNorm ?? '');
  const rtNorm =
    rt === 'comparison' ? 'compare' : rt === 'approval' ? 'approve' : rt;
  if (k === 'complete') return true;
  if (rtNorm === 'compare') return false;
  return (
    k === 'approved' ||
    k === 'needs-changes' ||
    k === 'changes-needed'
  );
}

/** "Complete" header pill colour from `decision_status`. */
function completeLifecyclePillColor(
  decisionStatus: string | null | undefined,
): StatusPillColor {
  const s = normStatus(decisionStatus);
  if (!s) return 'mushroom';
  if (s === 'approved') return 'green';
  if (s === 'rejected' || s === 'blocked') return 'error';
  if (s === 'needs-changes' || s === 'changes-needed') return 'brand';
  return 'mushroom';
}

function resolveHeaderLifecycle(args: {
  raw: string;
  decisionStatus: string | null | undefined;
  reviewTypeNorm?: string;
  openChangeRequestCount?: number;
}): { label: string; color: StatusPillColor; tooltip?: string } {
  return resolveReviewStatusPill({
    status: args.raw,
    reviewType: args.reviewTypeNorm,
    decisionStatus: args.decisionStatus,
    openChangeRequestCount: args.openChangeRequestCount,
  });
}

function deriveDecisionPill(
  decisionStatus: string | null | undefined,
  reviewTypeNorm: string,
): {
  color: StatusPillColor;
  label: string;
} {
  const s = normStatus(decisionStatus);
  const rt =
    reviewTypeNorm === 'comparison'
      ? 'compare'
      : reviewTypeNorm === 'approval'
        ? 'approve'
        : reviewTypeNorm;
  if (s === 'approved') {
    return {
      color: 'green',
      label: rt === 'compare' ? 'Direction Approved' : 'Approved',
    };
  }
  if (s === 'needs-changes' || s === 'changes-needed') {
    return {
      color: 'brand',
      label:
        rt === 'compare'
          ? 'Direction Confirmed, Changes Needed'
          : 'Changes Needed',
    };
  }
  if (s === 'rejected') return { color: 'error', label: 'Rejected' };
  if (s === 'blocked') return { color: 'error', label: 'Rejected' };
  return { color: 'mushroom', label: 'Decision' };
}
function toOrdinalDay(day: number) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

const REVIEW_DATE_LOCALE_OPTS = { timeZone: 'UTC' } as const;

function formatRequestedAtTooltip(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.toLocaleString('en-US', {
    month: 'long',
    ...REVIEW_DATE_LOCALE_OPTS,
  });
  const day = toOrdinalDay(date.getUTCDate());
  const year = date.getUTCFullYear();
  const time = date
    .toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...REVIEW_DATE_LOCALE_OPTS,
    })
    .toLowerCase();
  return `${month} ${day}, ${year} @ ${time}`;
}

function formatReviewDetailsDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.toLocaleString('en-US', {
    month: 'long',
    ...REVIEW_DATE_LOCALE_OPTS,
  });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const time = date
    .toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...REVIEW_DATE_LOCALE_OPTS,
    })
    .toLowerCase();
  return `${month} ${day}, ${year} @ ${time}`;
}

function reviewDetailsAttributionLine(input: {
  ownerName: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}) {
  const owner = input.ownerName?.trim() || 'Review owner';
  const created = input.createdAt ? new Date(input.createdAt) : null;
  const updated = input.updatedAt ? new Date(input.updatedAt) : null;
  const createdTime = created && !Number.isNaN(created.getTime()) ? created.getTime() : null;
  const updatedTime = updated && !Number.isNaN(updated.getTime()) ? updated.getTime() : null;
  const hasEdits = createdTime != null && updatedTime != null && updatedTime > createdTime;
  const label = hasEdits ? 'Edited by' : 'Created by';
  const dateLabel = formatReviewDetailsDate(hasEdits ? input.updatedAt : input.createdAt);
  return `${label} ${owner}${dateLabel ? `, ${dateLabel}` : ''}`;
}

function resolveTradeoffArtifactLabel(
  tradeoff: Tradeoff,
  artifacts: ReviewArtifact[],
): string | undefined {
  const explicit = (tradeoff.artifactLabel ?? '').trim();
  if (explicit) return explicit;
  const ids = [...(tradeoff.relatedArtifactIds ?? [])].filter(Boolean);
  if (ids.length === 0) return undefined;
  const names = ids
    .map((id) => {
      const artifact = artifacts.find((entry) => entry.id === id);
      return (
        (artifact?.label ?? artifact?.title ?? artifact?.originalFileName ?? '').trim() ||
        id
      );
    })
    .filter(Boolean);
  return names.length > 0 ? names.join(' · ') : undefined;
}

function resolveTradeoffArtifactIds(
  tradeoff: Tradeoff,
  artifacts: ReviewArtifact[],
): string[] {
  const ids = [...(tradeoff.relatedArtifactIds ?? [])].filter(Boolean);
  if (ids.length > 0) return ids;
  const label = (tradeoff.artifactLabel ?? '').trim();
  if (!label) return [];
  const match = artifacts.find((artifact) => {
    const name = (artifact.label ?? artifact.title ?? artifact.originalFileName ?? '').trim();
    return name === label;
  });
  return match ? [match.id] : [];
}

function serializeTradeoffsForReview(tradeoffs: Tradeoff[]) {
  return tradeoffs.map((tradeoff) => ({
    id: tradeoff.id,
    label: tradeoff.label,
    severity: tradeoff.severity,
    relatedArtifactIds: [...(tradeoff.relatedArtifactIds ?? [])],
    artifactLabel: tradeoff.artifactLabel ?? null,
    createdByContributorId: tradeoff.createdByContributorId ?? null,
  }));
}

function canEditTradeoff(
  tradeoff: Tradeoff,
  currentContributorId: string | null,
  canEditCoreDetails: boolean,
): boolean {
  if (canEditCoreDetails) return true;
  if (!currentContributorId || !tradeoff.createdByContributorId) return false;
  return tradeoff.createdByContributorId === currentContributorId;
}

function isDefaultFilters(filters: MenuSectionsState) {
  return filters.tags.all && filters.people.all;
}

function afterRemovingIncludedTag(
  prev: MenuSectionsState,
  nextTags: MenuSectionsState['tags'],
): MenuSectionsState {
  const any =
    nextTags.feedback ||
    nextTags.changeRequests ||
    nextTags.replies ||
    nextTags.notifications;
  if (!nextTags.all && !any) {
    return {
      ...prev,
      tags: {
        all: true,
        feedback: false,
        changeRequests: false,
        replies: false,
        notifications: false,
      },
    };
  }
  return { ...prev, tags: nextTags };
}

function resolveReviewerFeedbackIdForChangeRequest(
  cr: ReviewChangeRequestEntry,
  allFeedbackRows: ReviewerFeedbackEntry[],
  reviewCreatedAt: string | null | undefined = null,
): string | null {
  if (cr.reviewer_feedback_id) return cr.reviewer_feedback_id;
  const reviewerId = cr.reviewer_id ?? '';
  if (!reviewerId) return null;
  const submissions = allFeedbackRows
    .filter((row) => row.reviewerId === reviewerId && row.status === 'submitted')
    .sort(
      (a, b) =>
        new Date(String(a.requestedAt ?? a.submittedAt ?? 0)).getTime() -
        new Date(String(b.requestedAt ?? b.submittedAt ?? 0)).getTime(),
    );
  if (submissions.length === 0) return null;
  const crTime = new Date(cr.created_at).getTime();
  if (Number.isNaN(crTime)) return null;
  const entryIndex = submissions.findIndex((row, idx) => {
    const entryTime = new Date(
      String(row.submittedAt ?? row.requestedAt ?? 0),
    ).getTime();
    const prevTimeRaw =
      idx > 0
        ? new Date(
            String(
              submissions[idx - 1].submittedAt ?? submissions[idx - 1].requestedAt ?? 0,
            ),
          ).getTime()
        : new Date(String(reviewCreatedAt ?? 0)).getTime();
    const prevTime = Number.isNaN(prevTimeRaw) ? 0 : prevTimeRaw;
    return crTime > prevTime && crTime <= entryTime;
  });
  if (entryIndex >= 0) return submissions[entryIndex].feedbackId ?? null;
  return null;
}

function countsTowardChangeRequestBatch(
  row: ReviewerFeedbackEntry,
  allFeedbackRows: ReviewerFeedbackEntry[],
  changeRequests: ReviewChangeRequestEntry[],
  reviewCreatedAt: string | null | undefined = null,
): boolean {
  if (row.feedbackKind === 'change-request' || row.feedbackKind === 'mixed') return true;
  if (row.feedbackKind === 'approval') return false;
  if (!row.feedbackId) return false;
  return changeRequests.some(
    (cr) =>
      resolveReviewerFeedbackIdForChangeRequest(
        cr,
        allFeedbackRows,
        reviewCreatedAt,
      ) === row.feedbackId,
  );
}

function submissionBatchNumberForFeedbackId(
  allFeedbackRows: ReviewerFeedbackEntry[],
  changeRequests: ReviewChangeRequestEntry[],
  reviewerId: string,
  feedbackId: string | null | undefined,
  reviewCreatedAt: string | null | undefined = null,
): number {
  const subs = allFeedbackRows
    .filter(
      (row) =>
        row.reviewerId === reviewerId &&
        row.status === 'submitted' &&
        countsTowardChangeRequestBatch(
          row,
          allFeedbackRows,
          changeRequests,
          reviewCreatedAt,
        ),
    )
    .sort(
      (a, b) =>
        new Date(String(a.requestedAt ?? a.submittedAt ?? 0)).getTime() -
        new Date(String(b.requestedAt ?? b.submittedAt ?? 0)).getTime(),
    );
  if (!feedbackId) return Math.max(1, subs.length);
  const idx = subs.findIndex((row) => row.feedbackId === feedbackId);
  return idx >= 0 ? idx + 1 : Math.max(1, subs.length);
}

function changeRequestsForFeedbackSubmission(
  entry: ReviewerFeedbackEntry,
  allFeedbackRows: ReviewerFeedbackEntry[],
  changeRequests: ReviewChangeRequestEntry[],
  reviewCreatedAt: string | null | undefined = null,
): ReviewChangeRequestEntry[] {
  if (!entry.feedbackId) return [];
  return changeRequests
    .filter((cr) => {
      if (cr.reviewer_id !== entry.reviewerId) return false;
      return (
        resolveReviewerFeedbackIdForChangeRequest(
          cr,
          allFeedbackRows,
          reviewCreatedAt,
        ) === entry.feedbackId
      );
    })
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
}

function decisionCardOwnerLabel(
  entry: ReviewerFeedbackEntry,
  contributorsById: Map<string, ContributorOption>,
): string {
  const submittedById = entry.submittedById;
  if (submittedById && submittedById !== entry.reviewerId) {
    const submitterName =
      entry.submittedByName?.trim() ||
      contributorsById.get(submittedById)?.name ||
      'Creator';
    return `${submitterName} on behalf of ${entry.reviewerName}`;
  }
  return entry.reviewerName;
}

function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

function FigmaSnapshotMediaChrome({
  artifact,
  children,
}: {
  artifact: ReviewArtifact;
  children: (args: {
    mediaViewMode: 'live' | 'snapshot';
    previewOverlay: ReactNode;
    onSnapshotImageClick?: () => void;
    snapshotUrl?: string | null;
  }) => ReactNode;
}) {
  const hasSnapshot = Boolean(
    artifact.linkUrl?.toLowerCase().includes('figma.com') &&
      String(artifact.snapshotUrl ?? '').trim(),
  );
  const [mediaViewMode, setMediaViewMode] = useState<'live' | 'snapshot'>(
    hasSnapshot ? 'snapshot' : 'live',
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (hasSnapshot) setMediaViewMode('snapshot');
  }, [hasSnapshot, artifact.snapshotUrl]);

  const previewOverlay = hasSnapshot ? (
    <div
      role="group"
      aria-label="Artifact preview mode"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        height: 28,
        padding: 2,
        borderRadius: 999,
        background: 'rgba(255, 255, 255, 0.7)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        boxSizing: 'border-box',
      }}
    >
      {(
        [
          { key: 'snapshot' as const, label: 'Image' },
          { key: 'live' as const, label: 'Live' },
        ] as const
      ).map((option) => {
        const active = mediaViewMode === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => setMediaViewMode(option.key)}
            style={{
              height: 24,
              padding: '0 10px',
              border: 'none',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              lineHeight: 1,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              cursor: 'pointer',
              transition: 'all 200ms ease-in-out',
              background: active
                ? 'var(--brand-primary, #6b1e2e)'
                : 'transparent',
              color: active
                ? '#ffffff'
                : 'var(--text-secondary, #6b5e55)',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      {children({
        mediaViewMode: hasSnapshot ? mediaViewMode : 'live',
        previewOverlay,
        onSnapshotImageClick: hasSnapshot
          ? () => setLightboxOpen(true)
          : undefined,
        snapshotUrl: artifact.snapshotUrl ?? null,
      })}
      {lightboxOpen && artifact.snapshotUrl ? (
        <ArtifactSnapshotLightbox
          src={artifact.snapshotUrl}
          capturedAt={artifact.snapshotCapturedAt}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </>
  );
}

//  View 

export function ReviewDetailView({
  reviewId,
  title,
  status: rawStatus,
  reviewType,
  reviewFocus: reviewFocusProp,
  projectId,
  projectName,
  projectStatus = null,
  mode,
  artifacts: artifactsProp,
  problems: problemsProp,
  contributors,
  assignedReviewers,
  feedbackEntries,
  allFeedbackRows: allFeedbackRowsProp = [],
  changeRequests,
  cardReplies: cardRepliesProp = [],
  currentContributorId,
  currentContributorRole,
  currentContributorPermissionLevel = null,
  workspacePermissionLevel = null,
  currentAuthUserId = null,
  reviewCreatorAuthUserId = null,
  requireDecisionMaker,
  decisionMakerId = null,
  contactDisplayById = {},
  decision: decisionData,
  decisionSnapshots: decisionSnapshotsProp = [],
  reviewOwnerName,
  lastReminderSentAt: lastReminderSentAtProp = null,
  reviewCreatedAt = null,
  reviewUpdatedAt = null,
  activeTabIndex = 0,
  tradeoffs: tradeoffsProp = [],
}: ReviewDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { reviewerType } = useActiveWorkspacePermission();
  const showReviewersNotifiedToast = useCallback(() => {
    showToast({
      message: 'Reviewers notified',
      actionLabel: 'View',
      onAction: () => router.push(`/reviews/${reviewId}?tab=activity`),
    });
  }, [reviewId, router, showToast]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const sortedDecisionSnapshots = useMemo(
    () =>
      [...decisionSnapshotsProp].sort((a, b) => {
        const second = (iso: string) => {
          const ms = new Date(iso).getTime();
          return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
        };
        const diff = second(b.decision_made_at) - second(a.decision_made_at);
        if (diff !== 0) return diff;
        const roleRank = (role: ReviewDecisionSnapshotEntry['entry_role']) =>
          role === 'approval' ? 0 : 1;
        const roleDiff = roleRank(a.entry_role) - roleRank(b.entry_role);
        if (roleDiff !== 0) return roleDiff;
        return 0;
      }),
    [decisionSnapshotsProp],
  );
  const isReviewCreator = Boolean(
    reviewCreatorAuthUserId &&
      currentAuthUserId &&
      reviewCreatorAuthUserId === currentAuthUserId,
  );
  const canEditCoreDetails =
    canEditReviewDetails(currentContributorPermissionLevel ?? null) ||
    canEditReviewDetails(workspacePermissionLevel ?? null) ||
    isReviewCreator;
  const canEditReviewMenu =
    canEditReviewDetails(currentContributorPermissionLevel ?? null) ||
    canEditReviewDetails(workspacePermissionLevel ?? null);
  const canDeleteReviewMenu =
    normalizeWorkspacePermission(currentContributorPermissionLevel ?? null) ===
      'admin' ||
    normalizeWorkspacePermission(workspacePermissionLevel ?? null) === 'admin';
  const showReviewKebabMenu = canEditReviewMenu || canDeleteReviewMenu;
  const isForcedViewOnly = canUseViewOnlyReviewMode({
    requestedMode: mode,
    canEditCoreDetails,
  });
  const coreInteractionMode: ReviewMode = isForcedViewOnly ? 'view-only' : 'edit';
  const canAddTradeoffs = canAddTradeoff({
    currentContributorId,
    requestedMode: mode,
  });
  const reviewerContributorIds = useMemo(
    () => assignedReviewers.map((reviewer) => reviewer.id),
    [assignedReviewers],
  );
  const canEditReview = useMemo(
    () =>
      normalizeWorkspacePermission(workspacePermissionLevel ?? null) !== 'reviewer' ||
      reviewerContributorIds.includes(currentContributorId ?? ''),
    [currentContributorId, reviewerContributorIds, workspacePermissionLevel],
  );
  const rawReviewType = reviewType.trim().toLowerCase();
  const normalizedReviewType =
    rawReviewType === 'comparison'
      ? 'compare'
      : rawReviewType === 'approval'
        ? 'approve'
        : rawReviewType === 'alignment'
          ? 'align'
          : rawReviewType;
  const reviewTypeDisplayLabel =
    normalizedReviewType === 'compare'
      ? 'Compare'
      : normalizedReviewType === 'approve'
        ? 'Approve'
        : normalizedReviewType === 'critique'
          ? 'Critique'
          : 'Align';

  // Editable snapshots (edit mode only  view-only never writes).
  //
  // - `artifacts` seeds from the server fetch.
  // - `problems` is only the subset actually linked to this review;
  //   `allProjectProblems` keeps the full project list so the "Select from
  //   project" dropdown can offer the ones not yet linked.
  // - `tradeoffs` seed from `reviews.tradeoffs` when present; otherwise from
  //   the create modals on this page.
  const [reviewFocus, setReviewFocus] = useState(reviewFocusProp);
  const [artifacts, setArtifacts] = useState<ReviewArtifact[]>(artifactsProp);
  const [problems, setProblems] = useState<Problem[]>(
    problemsProp.filter((p) => p.selected)
  );
  const [allProjectProblems, setAllProjectProblems] =
    useState<Problem[]>(problemsProp);
  const [tradeoffs, setTradeoffs] = useState<Tradeoff[]>(tradeoffsProp);
  const [reviewers, setReviewers] = useState<Reviewer[]>(
    assignedReviewers.map((reviewer) => ({
      id: reviewer.id,
      name: reviewer.name,
      role: reviewer.role,
      email: reviewer.email,
      variant: reviewerChipVariantForType(reviewer.isDecisionMaker, normalizedReviewType),
      isDecisionMaker: reviewer.isDecisionMaker,
    }))
  );
  const [savingReviewers, setSavingReviewers] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [lastReminderSentAt, setLastReminderSentAt] = useState<string | null>(
    lastReminderSentAtProp,
  );
  const [showPublishFromBellModal, setShowPublishFromBellModal] = useState(false);
  const [publishingReview, setPublishingReview] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingReview, setDeletingReview] = useState(false);

  const [reviewAccessRequestSent, setReviewAccessRequestSent] = useState(false);
  const [reviewAccessRequestRecipientName, setReviewAccessRequestRecipientName] =
    useState<string | null>(null);
  const [reviewAccessRequestSentAt, setReviewAccessRequestSentAt] = useState<
    string | null
  >(null);
  const [reviewAccessRequestSubmitting, setReviewAccessRequestSubmitting] =
    useState(false);
  const [reviewRequesterContributorId, setReviewRequesterContributorId] = useState<
    string | null
  >(null);
  const [reviewWorkspaceId, setReviewWorkspaceId] = useState<string | null>(null);
  const [reviewPendingAccessRequestCount, setReviewPendingAccessRequestCount] =
    useState(0);
  const [reviewPendingAccessRequesterNames, setReviewPendingAccessRequesterNames] =
    useState<string[]>([]);

  const { assignableOptions, userIdByContributorId } = useWorkspaceReviewerPickerOptions(
    reviewWorkspaceId,
    assignedReviewers,
  );

  useEffect(() => {
    setLastReminderSentAt(lastReminderSentAtProp);
  }, [lastReminderSentAtProp]);

  const [isReminderRateLimited, setIsReminderRateLimited] = useState(false);

  // Re-evaluate the shared 1-hour cooldown on a 60s tick so the bell
  // re-enables automatically once the window elapses, without a page reload.
  useEffect(() => {
    const evaluate = () => {
      if (!lastReminderSentAt) {
        setIsReminderRateLimited(false);
        return;
      }
      const sentAt = new Date(lastReminderSentAt).getTime();
      if (Number.isNaN(sentAt)) {
        setIsReminderRateLimited(false);
        return;
      }
      setIsReminderRateLimited(Date.now() - sentAt < 60 * 60 * 1000);
    };
    evaluate();
    const id = window.setInterval(evaluate, 60_000);
    return () => window.clearInterval(id);
  }, [lastReminderSentAt]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data: projectRow } = await supabase
        .from('projects')
        .select('workspace_id')
        .eq('id', projectId)
        .maybeSingle();
      const resolvedWorkspaceId = String(
        (projectRow as { workspace_id?: string | null } | null)?.workspace_id ?? '',
      ).trim();
      if (cancelled) return;
      if (!resolvedWorkspaceId) {
        setReviewWorkspaceId(null);
        return;
      }
      setReviewWorkspaceId(resolvedWorkspaceId);

      const { requesterContributorId: requesterId, pending } =
        await loadPendingAccessRequestClient(supabase, {
          workspaceId: resolvedWorkspaceId,
          reviewId,
        });
      if (cancelled) return;
      setReviewRequesterContributorId(requesterId);
      if (pending) {
        setReviewAccessRequestSent(true);
        setReviewAccessRequestRecipientName(pending.recipientName);
        setReviewAccessRequestSentAt(pending.createdAt);
      }

      const pendingSummary = await loadReviewPendingAccessRequestSummary(
        supabase,
        reviewId,
      );
      if (cancelled) return;
      setReviewPendingAccessRequestCount(pendingSummary.count);
      setReviewPendingAccessRequesterNames(pendingSummary.requesterNames);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, reviewId, supabase]);

  const refreshReviewPendingAccessRequests = useCallback(async () => {
    const pendingSummary = await loadReviewPendingAccessRequestSummary(
      supabase,
      reviewId,
    );
    setReviewPendingAccessRequestCount(pendingSummary.count);
    setReviewPendingAccessRequesterNames(pendingSummary.requesterNames);
  }, [reviewId, supabase]);

  /**
   * Open workspace reviewers without project membership may request review access.
   * Stakeholder share-link viewers use `mode === 'view-only'` (?mode=view) and
   * are excluded — they are not workspace members requesting teammate access.
   */
  const showReviewRequestAccess = useMemo(() => {
    if (mode === 'view-only') return false;
    if (normalizeWorkspacePermission(workspacePermissionLevel ?? null) !== 'reviewer') {
      return false;
    }
    if (reviewerType !== 'open') return false;
    const reviewerContributorIds = assignedReviewers.map((reviewer) => reviewer.id);
    const isAssignedToThisReview =
      currentContributorId != null &&
      reviewerContributorIds.includes(currentContributorId);
    if (isAssignedToThisReview) return false;
    const normalizedReviewStatus = normalizeReviewStatusKey(rawStatus);
    if (!REQUEST_TO_REVIEW_VISIBLE_STATUSES.has(normalizedReviewStatus)) {
      return false;
    }
    if (
      assignedReviewers.some(
        (reviewer) =>
          reviewer.id === currentContributorId ||
          reviewer.id === reviewRequesterContributorId,
      )
    ) {
      return false;
    }
    return true;
  }, [
    assignedReviewers,
    currentContributorId,
    mode,
    rawStatus,
    reviewRequesterContributorId,
    reviewerType,
    workspacePermissionLevel,
  ]);

  const handleReviewRequestAccess = useCallback(async () => {
    if (
      reviewAccessRequestSent ||
      reviewAccessRequestSubmitting ||
      !reviewWorkspaceId ||
      !reviewRequesterContributorId
    ) {
      return;
    }

    setReviewAccessRequestSubmitting(true);
    const result = await submitAccessRequestClient({
      supabase,
      projectId,
      workspaceId: reviewWorkspaceId,
      requestedByContributorId: reviewRequesterContributorId,
      reviewId,
    });
    setReviewAccessRequestSubmitting(false);

    if (!result.success) return;

    showToast({ message: 'Access request sent' });
    setReviewAccessRequestSent(true);
    setReviewAccessRequestRecipientName(result.recipientName);
    setReviewAccessRequestSentAt(new Date().toISOString());
  }, [
    projectId,
    reviewAccessRequestSent,
    reviewAccessRequestSubmitting,
    reviewId,
    reviewRequesterContributorId,
    reviewWorkspaceId,
    showToast,
    supabase,
  ]);

  const reviewHeaderPrimaryAction = useMemo(() => {
    if (!showReviewRequestAccess) {
      return <span />;
    }

    if (reviewAccessRequestSent) {
      const tooltipLabel = formatAccessRequestSentTooltip(
        reviewAccessRequestRecipientName,
        reviewAccessRequestSentAt,
      );
      return (
        <Tooltip label={tooltipLabel} position="bottom">
          <span style={{ display: 'inline-flex' }}>
            <Button variant="accent" size="sm" label="Request Sent" disabled />
          </span>
        </Tooltip>
      );
    }

    return (
      <Button
        variant="accent"
        size="sm"
        label="Request to Review"
        disabled={reviewAccessRequestSubmitting || !reviewRequesterContributorId}
        onClick={() => void handleReviewRequestAccess()}
      />
    );
  }, [
    handleReviewRequestAccess,
    reviewAccessRequestRecipientName,
    reviewAccessRequestSent,
    reviewAccessRequestSentAt,
    reviewAccessRequestSubmitting,
    reviewRequesterContributorId,
    showReviewRequestAccess,
  ]);

  const handleSendReminder = useCallback(async (): Promise<boolean> => {
    if (sendingReminder) return false;
    setSendingReminder(true);
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/remind`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as {
        sent?: number;
        last_reminder_sent_at?: string | null;
        last_sent_at?: string | null;
        error?: string;
      };
      if (res.status === 429) {
        if (data.error === 'rate_limited') {
          const rateLimitedAt =
            data.last_sent_at ?? data.last_reminder_sent_at ?? lastReminderSentAt;
          if (rateLimitedAt) setLastReminderSentAt(rateLimitedAt);
          showToast('A reminder was already sent recently');
          return false;
        }
        showToast({
          message: 'Too many requests — please wait a moment and try again.',
          sentiment: 'danger',
        });
        return false;
      }
      if (!res.ok) {
        showToast({
          message: 'Failed to send reminder — please try again',
          sentiment: 'danger',
        });
        return false;
      }
      if (data.last_reminder_sent_at) {
        setLastReminderSentAt(data.last_reminder_sent_at);
      }
      const sent = typeof data.sent === 'number' ? data.sent : 0;
      if (sent === 0) {
        showToast('No pending reviewers to remind');
      } else {
        showToast(REMINDER_SUCCESS_TOAST);
      }
      return sent > 0;
    } catch {
      showToast({
        message: 'Failed to send reminder — please try again',
        sentiment: 'danger',
      });
      return false;
    } finally {
      setSendingReminder(false);
    }
  }, [reviewId, sendingReminder, showToast, lastReminderSentAt]);

  const [showFeedbackDrawer, setShowFeedbackDrawer] = useState(false);
  const pendingRevalidation = useRef(false);
  const [feedbackSavedAlertVisible, setFeedbackSavedAlertVisible] = useState(false);
  const [feedbackDrawerIsNew, setFeedbackDrawerIsNew] = useState(true);
  const [feedbackDrawerTargetReviewerId, setFeedbackDrawerTargetReviewerId] = useState<string | null>(null);
  const [feedbackDrawerDraftOverride, setFeedbackDrawerDraftOverride] = useState<{
    feedbackText: string;
    selectedOption: string | null;
  } | null>(null);
  const [feedbackDrawerExistingFeedbackId, setFeedbackDrawerExistingFeedbackId] =
    useState<string | null>(null);
  const [feedbackDrawerInitialChangeRequests, setFeedbackDrawerInitialChangeRequests] =
    useState<
      Array<{ batchId: string; artifactIds: string[]; changesNeeded: string }>
    >([]);
  type SubmitFeedbackDrawerOpenOptions = {
    prefill?: boolean;
    feedbackEntryId?: string;
    targetReviewerId?: string | null;
  };
  const feedbackRowsForLookup =
    allFeedbackRowsProp.length > 0 ? allFeedbackRowsProp : feedbackEntries;
  const openSubmitFeedbackDrawer = useCallback(
    (options?: SubmitFeedbackDrawerOpenOptions) => {
      const creatorNeedsOnBehalfSelection = Boolean(
        reviewCreatorAuthUserId &&
          currentAuthUserId &&
          reviewCreatorAuthUserId === currentAuthUserId &&
          (!currentContributorId ||
            !assignedReviewers.some((reviewer) => reviewer.id === currentContributorId)),
      );
      if (options?.prefill && options.feedbackEntryId) {
        const entry = feedbackRowsForLookup.find(
          (row) =>
            row.feedbackId === options.feedbackEntryId ||
            `feedback-${row.reviewerId}` === options.feedbackEntryId,
        );
        if (entry) {
          setFeedbackDrawerTargetReviewerId(options.targetReviewerId ?? entry.reviewerId);
          if (creatorNeedsOnBehalfSelection) {
            setFeedbackDrawerDraftOverride(null);
    setFeedbackDrawerIsNew(true);
    setShowFeedbackDrawer(true);
            return;
          }
          const isApproveResubmit = normalizedReviewType === 'approve';
          setFeedbackDrawerDraftOverride(
            isApproveResubmit
              ? { feedbackText: '', selectedOption: null }
              : {
                  feedbackText: entry.feedbackText ?? '',
                  selectedOption: entry.selectedOption,
                },
          );
          setFeedbackDrawerExistingFeedbackId(
            normalizedReviewType === 'align' ? entry.feedbackId ?? null : null,
          );
          if (normalizedReviewType === 'align') {
            setFeedbackDrawerInitialChangeRequests(
              changeRequests
                .filter((cr) => cr.reviewer_id === entry.reviewerId)
                .map((cr) => ({
                  batchId: String(cr.batch_id ?? cr.id).trim() || String(cr.id),
                  artifactIds: Array.isArray(cr.artifact_ids)
                    ? cr.artifact_ids.map((id) => String(id).trim()).filter(Boolean)
                    : [],
                  changesNeeded: String(cr.changes_needed ?? '').trim(),
                })),
            );
          } else {
            setFeedbackDrawerInitialChangeRequests([]);
          }
          setFeedbackDrawerIsNew(false);
          setShowFeedbackDrawer(true);
          return;
        }
      }
      setFeedbackDrawerTargetReviewerId(options?.targetReviewerId ?? null);
      setFeedbackDrawerDraftOverride(null);
      setFeedbackDrawerExistingFeedbackId(null);
      setFeedbackDrawerInitialChangeRequests([]);
      setFeedbackDrawerIsNew(true);
      setShowFeedbackDrawer(true);
    },
    [
      feedbackRowsForLookup,
      normalizedReviewType,
      reviewCreatorAuthUserId,
      currentAuthUserId,
      currentContributorId,
      assignedReviewers,
      changeRequests,
    ],
  );
  const flushPendingRevalidation = useCallback(() => {
    if (pendingRevalidation.current) {
      router.refresh();
      pendingRevalidation.current = false;
    }
  }, [router]);
  const handleChangeRequestCreatedWhileDrawer = useCallback(() => {
    if (showFeedbackDrawer) {
      pendingRevalidation.current = true;
    } else {
      router.refresh();
    }
  }, [showFeedbackDrawer, router]);
  const [showFinalDecisionDrawer, setShowFinalDecisionDrawer] = useState(false);
  const [finalDecisionChangeDirection, setFinalDecisionChangeDirection] = useState(false);
  const [reviewDetailsSaveErrorToast, setReviewDetailsSaveErrorToast] = useState<string | null>(null);
  const [showEditTypeModal, setShowEditTypeModal] = useState(false);
  const lastSavedReviewFocusRef = useRef(reviewFocusProp);
  const lastSavedArtifactDescriptionsRef = useRef<Record<string, string>>(
    Object.fromEntries(artifactsProp.map((artifact) => [artifact.id, artifact.description])),
  );
  const [artifactAiUnavailableById, setArtifactAiUnavailableById] = useState<Record<string, boolean>>({});
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [headerStatusOverride, setHeaderStatusOverride] = useState<string | null>(null);
  const [headerLifecycleMenuOpen, setHeaderLifecycleMenuOpen] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [notifyOnReopen, setNotifyOnReopen] = useState(true);
  const [reopenKebabSubmitting, setReopenKebabSubmitting] = useState(false);
  const [reviewMenu, setReviewMenu] = useState<null | 'header'>(null);
  const [lifecycleToast, setLifecycleToast] = useState<string | null>(null);
  const [editReviewDrawerOpen, setEditReviewDrawerOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [editingTradeoff, setEditingTradeoff] = useState<Tradeoff | null>(null);
  const [openTradeoffMenuId, setOpenTradeoffMenuId] = useState<string | null>(null);
  const tradeoffMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const headerStatusRef = useRef<HTMLDivElement | null>(null);
  const pageKebabSectionRef = useRef<HTMLDivElement | null>(null);
  const pageHeaderRef = useRef<HTMLDivElement | null>(null);
  const [pageHeaderHeight, setPageHeaderHeight] = useState(48);
  const [changeRequestReplies, setChangeRequestReplies] = useState<Record<string, string>>({});
  const [tabIndex, setTabIndex] = useState(activeTabIndex);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const bumpActivityLog = useCallback(() => {
    setActivityRefreshKey((key) => key + 1);
  }, []);
  const [activeFilters, setActiveFilters] = useState<MenuSectionsState>({
    tags: {
      all: true,
      feedback: false,
      changeRequests: false,
      replies: false,
      notifications: false,
    },
    people: {
      all: true,
      reviewerIds: [],
    },
  });

  //  Create-problem modal 
  const [problemModalOpen, setProblemModalOpen] = useState(false);
  const [newProblemText, setNewProblemText] = useState('');
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null);
  const [editText, setEditText] = useState('');
  const [includeInProject, setIncludeInProject] = useState(true);

  //  Select-from-project inline dropdown (existing problems) 
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
  const [selectedFromProject, setSelectedFromProject] = useState<string[]>([]);
  const addButtonRef = useRef<HTMLDivElement | null>(null);
  const selectMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const [openKebabId, setOpenKebabId] = useState<string | null>(null);
  const kebabRefs = useRef<Record<string, HTMLDivElement | null>>({});

  //  Create-tradeoff modal 
  const [tradeoffModalOpen, setTradeoffModalOpen] = useState(false);
  const [newTradeoffText, setNewTradeoffText] = useState('');
  const [newTradeoffSeverity, setNewTradeoffSeverity] =
    useState<'High' | 'Medium' | 'Low'>('High');
  const [tradeoffSelectedArtifactIds, setTradeoffSelectedArtifactIds] = useState<
    string[]
  >([]);
  const [tradeoffArtifactPickerValue, setTradeoffArtifactPickerValue] =
    useState('');

  //  Create-teammate modal 
  const [reviewerModalOpen, setReviewerModalOpen] = useState(false);
  const [reopenReviewModalOpen, setReopenReviewModalOpen] = useState(false);
  const [reopenReviewSubmitting, setReopenReviewSubmitting] = useState(false);
  const [removeReviewerModalOpen, setRemoveReviewerModalOpen] = useState(false);
  const [removeReviewerSubmitting, setRemoveReviewerSubmitting] = useState(false);
  const [pendingReviewerRemoval, setPendingReviewerRemoval] = useState<{
    id: string;
    name: string;
    autoCloseOnRemoval: boolean;
  } | null>(null);
  const [pendingReviewerAddIds, setPendingReviewerAddIds] = useState<string[]>([]);
  const [pendingReviewerAddSource, setPendingReviewerAddSource] = useState<
    'overview' | 'rhc' | 'create-teammate' | null
  >(null);
  const [pendingReviewerAddLabel, setPendingReviewerAddLabel] = useState('reviewer');
  const [pendingReviewerAddCount, setPendingReviewerAddCount] = useState(1);
  const pendingReviewerAddConfirmRef = useRef<(() => Promise<void>) | null>(null);
  const [newReviewerName, setNewReviewerName] = useState('');
  const [newReviewerEmail, setNewReviewerEmail] = useState('');
  const [newReviewerRole, setNewReviewerRole] = useState('');
  const [includeInTeam, setIncludeInTeam] = useState(true);
  const [reviewerEmailExistsError, setReviewerEmailExistsError] = useState<
    string | null
  >(null);
  const [isCreatingTeammate, setIsCreatingTeammate] = useState(false);

  // Re-seed local drafts when the server-provided review changes (e.g. on
  // client-side navigation between reviews).
  const hasChangeRequests = changeRequests.length > 0;
  const showDecisionLog =
    normalizedReviewType === 'compare' ||
    normalizedReviewType === 'approve' ||
    (normalizedReviewType === 'align' && hasChangeRequests);
  const tabs = showDecisionLog
    ? [{ label: 'Overview' }, { label: 'Decision Log' }, { label: 'Activity' }]
    : [{ label: 'Overview' }, { label: 'Activity' }];
  const uiTabIndex =
    tabIndex === 2
      ? showDecisionLog
        ? 2
        : 1
      : tabIndex === 1
        ? showDecisionLog
          ? 1
          : 0
        : 0;

  useEffect(() => {
    setHeaderStatusOverride(null);
  }, [rawStatus]);

  useEffect(() => {
    const queryTab = searchParams.get('tab');
    if (queryTab === 'activity') {
      setTabIndex(2);
      return;
    }
    if (queryTab === 'decision') {
      if (showDecisionLog) {
        setTabIndex(1);
      } else {
        setTabIndex(0);
        const params = new URLSearchParams(searchParams.toString());
        params.delete('tab');
        const qs = params.toString();
        router.replace(qs ? `/reviews/${reviewId}?${qs}` : `/reviews/${reviewId}`);
      }
      return;
    }
    setTabIndex(0);
  }, [searchParams, showDecisionLog, router, reviewId]);

  const displayRawStatus = headerStatusOverride ?? rawStatus;
  const normalizedDisplayStatus = normStatus(displayRawStatus);
  const isReviewPaused = normalizedDisplayStatus === 'paused';
  const isReviewDraft = normalizedDisplayStatus === 'draft';
  const resolvedStatusKey =
    normalizedDisplayStatus === 'changes-needed' ? 'needs-changes' : normalizedDisplayStatus;
  const isResolved = (COMPLETABLE_STATUSES as readonly string[]).includes(resolvedStatusKey);
  const isComplete = normalizedDisplayStatus === 'complete';
  const compareDirectionApprovedLocked =
    normalizedReviewType === 'compare' && normalizedDisplayStatus === 'approved';
  const compareReviewFullyLocked =
    normalizedReviewType === 'compare' && normalizedDisplayStatus === 'complete';
  const reviewFieldsReadOnly = normalizedDisplayStatus === 'complete';

  const handleBellReminder = useCallback(async (): Promise<boolean> => {
    if (isReviewDraft) {
      setShowPublishFromBellModal(true);
      return false;
    }
    return handleSendReminder();
  }, [handleSendReminder, isReviewDraft]);

  const handlePublishFromBell = useCallback(async () => {
    setShowPublishFromBellModal(false);
    setPublishingReview(true);
    try {
      const result = await publishReviewAction(reviewId);
      if (result.error) {
        showToast(result.error);
        return;
      }
      showToast('Review published');
      showReviewersNotifiedToast();
      bumpActivityLog();
      router.refresh();
    } finally {
      setPublishingReview(false);
    }
  }, [
    bumpActivityLog,
    reviewId,
    router,
    showReviewersNotifiedToast,
    showToast,
  ]);

  const handleLifecyclePick = useCallback(
    async (next: string) => {
      setHeaderLifecycleMenuOpen(false);
      if (normStatus(next) === 'complete') {
        setShowCompleteModal(true);
        return;
      }
      setHeaderStatusOverride(next);
      const result = await updateReviewLifecycleStatusAction({
        reviewId,
        status: next,
      });
      if (!result.success) {
        setHeaderStatusOverride(null);
        return;
      }
      setLifecycleToast('Review status updated');
      bumpActivityLog();
      router.refresh();
    },
    [reviewId, router, bumpActivityLog],
  );

  const handleMarkCompleteConfirm = useCallback(async () => {
    setMarkingComplete(true);
    try {
      const result = await markCompleteAction(reviewId);
      if (!result.success) {
        showToast(result.error ?? 'Could not mark review as complete');
        return;
      }
      setShowCompleteModal(false);
      setHeaderStatusOverride('complete');
      showToast('Review marked as complete');
      bumpActivityLog();
      router.refresh();
    } finally {
      setMarkingComplete(false);
    }
  }, [reviewId, router, bumpActivityLog, showToast]);

  const handleStatusPillToggle = useCallback(() => {
    setHeaderLifecycleMenuOpen((open) => !open);
    setReviewMenu(null);
  }, []);

  const handleReopenReview = useCallback(() => {
    setReviewMenu(null);
    setShowReopenModal(true);
  }, []);

  const handleReopenKebabConfirm = useCallback(async () => {
    setReopenKebabSubmitting(true);
    const shouldNotify = notifyOnReopen;
    try {
      const result = await reopenReviewAction(reviewId, { notify: shouldNotify });
      setShowReopenModal(false);
      setNotifyOnReopen(true);
      if (!result.success) {
        showToast(result.error ?? 'Could not reopen review');
        return;
      }
      setHeaderStatusOverride(reopenReviewStatusForType(normalizedReviewType));
      showToast('Review reopened');
      if (shouldNotify) {
        showReviewersNotifiedToast();
      }
      bumpActivityLog();
      router.refresh();
    } finally {
      setReopenKebabSubmitting(false);
    }
  }, [
    reviewId,
    notifyOnReopen,
    normalizedReviewType,
    showToast,
    showReviewersNotifiedToast,
    bumpActivityLog,
    router,
  ]);

  useEffect(() => {
    function onPointerDown(ev: PointerEvent) {
      const t = ev.target as Node;
      if (
        headerStatusRef.current?.contains(t) ||
        pageKebabSectionRef.current?.contains(t)
      ) {
        return;
      }
      setHeaderLifecycleMenuOpen(false);
      setReviewMenu(null);
    }
    function onKey(ev: globalThis.KeyboardEvent) {
      if (ev.key === 'Escape') {
        setHeaderLifecycleMenuOpen(false);
        setReviewMenu(null);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    setTradeoffs(tradeoffsProp);
  }, [tradeoffsProp]);

  useEffect(() => {
    setReviewFocus(reviewFocusProp);
    lastSavedReviewFocusRef.current = reviewFocusProp;
  }, [reviewFocusProp]);
  useEffect(() => {
    setArtifacts(artifactsProp);
    lastSavedArtifactDescriptionsRef.current = Object.fromEntries(
      artifactsProp.map((artifact) => [artifact.id, artifact.description]),
    );
  }, [artifactsProp]);
  useEffect(() => {
    setProblems(problemsProp.filter((p) => p.selected));
    setAllProjectProblems(problemsProp);
  }, [problemsProp]);
  useEffect(() => {
    setReviewers(
      assignedReviewers.map((reviewer) => ({
        id: reviewer.id,
        name: reviewer.name,
        role: reviewer.role,
        email: reviewer.email,
        variant: reviewerChipVariantForType(reviewer.isDecisionMaker, normalizedReviewType),
        isDecisionMaker: reviewer.isDecisionMaker,
      }))
    );
  }, [assignedReviewers, normalizedReviewType]);

  // Close the "Select from project" dropdown on outside click. Gated on the
  // open flag so the listener is only live while the dropdown is open  a
  // dormant global pointerdown listener previously blocked navigation.
  useEffect(() => {
    if (!selectMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (selectMenuContainerRef.current?.contains(e.target as Node)) return;
        setSelectMenuOpen(false);
      }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [selectMenuOpen]);

  useEffect(() => {
    if (openKebabId === null) return;
    const activeId: string = openKebabId;
    function onPointerDown(e: PointerEvent) {
      const anchor = kebabRefs.current[activeId];
      if (!anchor?.contains(e.target as Node)) {
        setOpenKebabId(null);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [openKebabId]);

  useEffect(() => {
    if (openTradeoffMenuId === null) return;
    const activeId = openTradeoffMenuId;
    function onPointerDown(e: PointerEvent) {
      const anchor = tradeoffMenuRefs.current[activeId];
      if (!anchor?.contains(e.target as Node)) {
        setOpenTradeoffMenuId(null);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [openTradeoffMenuId]);

  // Project problems not already linked to this review  drives the Select menu.
  const remainingProblems = allProjectProblems.filter(
    (ap) => !problems.some((p) => p.id === ap.id)
  );
  const showHelperText =
    normalizedReviewType === 'compare' || normalizedReviewType === 'approve';
  const helperText =
    'The first reviewer in the list is the final decision maker. Reviewers will select a preferred option. A decision will be recorded when feedback is complete.';

  //  Modal close helpers (reset draft state) 
  const closeProblemModal = () => {
    setProblemModalOpen(false);
    setEditingProblem(null);
    setEditText('');
    setNewProblemText('');
    setIncludeInProject(true);
  };
  useEffect(() => {
    if (!tradeoffModalOpen || !editingTradeoff) return;
    setTradeoffSelectedArtifactIds(
      resolveTradeoffArtifactIds(editingTradeoff, artifacts),
    );
  }, [tradeoffModalOpen, editingTradeoff, artifacts]);

  const closeTradeoffModal = () => {
    setTradeoffModalOpen(false);
    setEditingTradeoff(null);
    setNewTradeoffText('');
    setNewTradeoffSeverity('High');
    setTradeoffSelectedArtifactIds([]);
    setTradeoffArtifactPickerValue('');
  };
  const closeReviewerModal = () => {
    setReviewerModalOpen(false);
    setNewReviewerName('');
    setNewReviewerEmail('');
    setNewReviewerRole('');
    setIncludeInTeam(true);
    setReviewerEmailExistsError(null);
  };

  useEffect(() => {
    if (!reviewerModalOpen) return;
    const email = newReviewerEmail.trim().toLowerCase();
    if (!email) {
      setReviewerEmailExistsError(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void supabase
        .from('contributors')
        .select('id')
        .ilike('email', email)
        .limit(1)
        .then(({ data }) => {
          if (cancelled) return;
          setReviewerEmailExistsError(
            Array.isArray(data) && data.length > 0
              ? 'A teammate with this email already exists.'
              : null
          );
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [reviewerModalOpen, newReviewerEmail, supabase]);

  //  RHC persisted state 
  const [rhcOpen, setRhcOpen] = useState(false);
  const [rhcHydrated, setRhcHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(RHC_STORAGE_KEY);
    if (stored !== null) {
      setRhcOpen(stored === 'true');
    } else {
      setRhcOpen(window.matchMedia(RHC_COMPACT_BREAKPOINT).matches);
    }
    setRhcHydrated(true);
  }, []);

  useEffect(() => {
    const node = pageHeaderRef.current;
    if (!node) return;
    const syncHeight = () => setPageHeaderHeight(node.offsetHeight);
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const toggleRhc = () => {
    setRhcOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RHC_STORAGE_KEY, String(next));
      }
      return next;
    });
  };

  //  Scroll-spy for left nav 
  const [activeSection, setActiveSection] = useState<string>(NAV_SECTIONS[0].id);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  // Scroll-position based spy. IntersectionObserver's rootMargin only fires
  // when an element crosses the configured band  on short pages the last
  // section never enters the band and the nav highlight gets stuck. A plain
  // scroll listener always picks the section whose top has passed the
  // read-line threshold (120px from the top of the scroll container).
  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const handleScroll = () => {
      const sectionEls = NAV_SECTIONS.map((s) => ({
        id: s.id,
        el: document.getElementById(s.id),
      })).filter((s): s is { id: string; el: HTMLElement } => s.el !== null);

      const containerTop = root.getBoundingClientRect().top;

      let active = sectionEls[0]?.id ?? NAV_SECTIONS[0].id;
      for (const { id, el } of sectionEls) {
        const relativeTop = el.getBoundingClientRect().top - containerTop;
        if (relativeTop <= 120) {
          active = id;
        }
      }
      setActiveSection(active);
    };

    root.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => root.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollLhcElementIntoView = (
    target: HTMLElement,
    options?: { align?: 'start' | 'center' },
  ) => {
    const root = scrollRootRef.current;
    if (!root) return;

    const rootRect = root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const measuredOffset =
      Number.parseFloat(window.getComputedStyle(root).paddingTop || '0') || 0;
    const align = options?.align ?? 'start';
    const baseTop = root.scrollTop + (targetRect.top - rootRect.top);
    const nextTop =
      align === 'center'
        ? baseTop - root.clientHeight / 2 + targetRect.height / 2
        : baseTop - measuredOffset;

    root.scrollTo({
      top: Math.max(0, nextTop),
      behavior: 'smooth',
    });
  };

  const scrollToSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    scrollLhcElementIntoView(target, { align: 'start' });
  };

  const scrollToTop = () => {
    scrollRootRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openDecisionLogTab = () => {
    if (!showDecisionLog) return;
    setTabIndex(1);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'decision');
    const qs = params.toString();
    router.replace(qs ? `/reviews/${reviewId}?${qs}` : `/reviews/${reviewId}`);
  };

  const reviewerIds = assignedReviewers.map((reviewer) => reviewer.id);
  const contributorsById = new Map(contributors.map((contributor) => [contributor.id, contributor]));
  const decisionMakerReviewerId = getDecisionMakerReviewerId(reviewType, reviewerIds);
  /** Persisted decision author after a decision exists; otherwise first reviewer for compare/approve. */
  const assignedDecisionOwnerId =
    (decisionMakerId && String(decisionMakerId).trim()) || decisionMakerReviewerId || null;
  const decisionMakerDisplayName = contactNameFromMap(
    contactDisplayById,
    assignedDecisionOwnerId,
    'Decision maker',
  );
  const decisionMaker = assignedReviewers.find(
    (reviewer) => reviewer.id === decisionMakerReviewerId
  );
  const decisionAttributionName = useMemo(
    () =>
      contactNameFromMap(
        contactDisplayById,
        decisionData.ownerId ?? null,
        contactNameFromMap(
          contactDisplayById,
          decisionMakerReviewerId,
          'Unassigned',
        ),
      ),
    [contactDisplayById, decisionData.ownerId, decisionMakerReviewerId],
  );
  const isDecisionMaker =
    normalizedReviewType === 'compare'
      ? Boolean(
          currentContributorId &&
            decisionMakerReviewerId &&
            currentContributorId === decisionMakerReviewerId,
        )
      : Boolean(
          currentContributorId &&
            assignedDecisionOwnerId &&
            currentContributorId === assignedDecisionOwnerId,
        );
  const decisionMade =
    Boolean(decisionData.madeAt) ||
    Boolean(decisionData.text) ||
    (normalizedReviewType === 'compare' &&
      (normalizedDisplayStatus === 'approved' || normalizedDisplayStatus === 'complete')) ||
    (decisionData.status !== null &&
      decisionData.status !== 'in-review' &&
      decisionData.status !== 'draft');
  const compareDirectionApproved =
    normalizedReviewType === 'compare' && normalizedDisplayStatus === 'approved';
  const openChangeRequestsCount = useMemo(
    () => changeRequests.filter((cr) => !cr.completed_at).length,
    [changeRequests],
  );
  const manualLifecycleOptions = useMemo(() => {
    const opts =
      canEditCoreDetails && coreInteractionMode === 'edit'
        ? manualReviewStatusMenuOptions(displayRawStatus)
        : [];
    return opts;
  }, [
    canEditCoreDetails,
    coreInteractionMode,
    displayRawStatus,
  ]);
  const compareSingleReviewer =
    normalizedReviewType === 'compare' && reviewerIds.length === 1;
  const compareAtFeedbackSubmitted =
    normalizedReviewType === 'compare' &&
    normalizedDisplayStatus === 'feedback-submitted' &&
    !decisionMade &&
    !compareSingleReviewer;
  const showComparisonButterPromptDm =
    normalizedReviewType === 'compare' &&
    !decisionMade &&
    isDecisionMaker &&
    (compareAtFeedbackSubmitted ||
      (compareSingleReviewer && normalizedDisplayStatus === 'in-review'));
  const comparisonDecisionPromptRowName = showComparisonButterPromptDm
    ? contactNameFromMap(
        contactDisplayById,
        currentContributorId,
        decisionMakerDisplayName,
      )
    : null;
  const showDecisionPromptReadonly =
    compareAtFeedbackSubmitted && !isDecisionMaker;
  const openFinalDecisionDrawer = useCallback(
    (options?: { changeDirection?: boolean }) => {
      if (normalizedReviewType === 'compare' && !isDecisionMaker) return;
      setFinalDecisionChangeDirection(Boolean(options?.changeDirection));
      setShowFinalDecisionDrawer(true);
    },
    [normalizedReviewType, isDecisionMaker],
  );
  const showCompareDirectionApprovedBanner =
    normalizedReviewType === 'compare' &&
    (normalizedDisplayStatus === 'approved' ||
      normalizedDisplayStatus === 'complete') &&
    decisionMade;
  const compareHideSubmitFeedback =
    normalizedReviewType === 'compare' &&
    (normalizedDisplayStatus === 'approved' ||
      (compareSingleReviewer && isDecisionMaker));
  const feedbackByReviewerId = useMemo(() => {
    const map = new Map<string, { status: 'submitted' | 'pending' }>();
    for (const reviewerId of reviewerIds) {
      const entries = feedbackEntries.filter((e) => e.reviewerId === reviewerId);
      const hasSubmitted = entries.some((e) => e.status === 'submitted');
      map.set(reviewerId, { status: hasSubmitted ? 'submitted' : 'pending' });
    }
    return map;
  }, [feedbackEntries, reviewerIds]);
  const repliesByCardId = useMemo(() => {
    const m = new Map<string, CardReplyRow[]>();
    for (const r of cardRepliesProp) {
      const list = m.get(r.card_id) ?? [];
      list.push(r);
      m.set(r.card_id, list);
    }
    for (const list of m.values()) {
      list.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }
    return m;
  }, [cardRepliesProp]);
  const allReviewerFeedbackSubmitted = hasAllReviewerFeedbackSubmitted({
    reviewerIds,
    feedbackByReviewerId,
  });
  const resolvedFeedbackEntries = feedbackEntries.map((entry) => ({
    ...entry,
    status: getReviewerDisplayState({
      reviewerId: entry.reviewerId,
      rawFeedbackStatus: entry.status,
      decisionMakerReviewerId,
      allReviewerFeedbackSubmitted,
      decisionMade,
    }),
  }));
  const hasFeedbackSubmitted = resolvedFeedbackEntries.some(
    (e) => e.status === 'submitted',
  );
  const reviewTypeViewerTooltip =
    normalizedReviewType === 'critique'
      ? 'Critique reviews require detailed feedback within artifacts.'
      : normalizedReviewType === 'approve'
        ? 'Approval reviews are seeking final feedback and signoff before the next stage.'
        : normalizedReviewType === 'compare'
          ? 'Comparison reviews are seeking a directional decision.'
          : 'Alignment reviews are high level reviews ensuring the project is going in the right direction.';
  const feedbackThreads: FeedbackThread[] = resolvedFeedbackEntries.map((entry) => {
    const fid = entry.feedbackId ?? `feedback-${entry.reviewerId}`;
    return {
      id: fid,
      reviewerId: entry.reviewerId,
      author: entry.reviewerName,
      authorEmail:
        assignedReviewers.find((reviewer) => reviewer.id === entry.reviewerId)?.email ??
        null,
      timestamp: '',
      submittedAtIso: entry.submittedAt ?? null,
      type: entry.feedbackText ? 'Feedback' : 'Feedback',
      text: entry.feedbackText ?? undefined,
      optionTag: entry.selectedOption ?? undefined,
      optionTags: conceptLabelsFromSelection(entry.selectedOption, artifacts),
      replies: undefined,
      status: entry.status,
      requestedAt: entry.requestedAt,
    };
  });
  const feedbackThreadById = new Map(feedbackThreads.map((thread) => [thread.id, thread]));
  const pendingFeedbackCount = feedbackThreads.filter(
    (c) => c.status === 'pending',
  ).length;
  const currentContributorName = useMemo(() => {
    if (!currentContributorId) return null;
    return contributors.find((c) => c.id === currentContributorId)?.name ?? null;
  }, [contributors, currentContributorId]);
  const reviewIsCompletedOrClosed = normalizedDisplayStatus === 'complete';
  // Type-agnostic: adding a reviewer to a review that has already received
  // feedback re-opens it. Covers Approve (approved / needs-changes /
  // changes-needed) AND Compare (feedback-submitted). Never fires for in-review
  // or terminal complete.
  const shouldReopenOnReviewerAdd =
    normalizedDisplayStatus === 'approved' ||
    normalizedDisplayStatus === 'needs-changes' ||
    normalizedDisplayStatus === 'changes-needed' ||
    normalizedDisplayStatus === 'feedback-submitted';
  const canManageReminderBell = isReviewCreator || canEditReviewMenu;
  const showReminderBell =
    canManageReminderBell &&
    !reviewIsCompletedOrClosed &&
    pendingFeedbackCount > 0 &&
    !isReviewPaused;
  const showDecisionLogRemindButton = showReminderBell;
  const reviewerCanSubmitFeedback = canSubmitFeedbackByRole({
    currentContributorId,
    reviewerIds,
    feedbackByReviewerId: new Map(
      resolvedFeedbackEntries.map((entry) => [entry.reviewerId, { status: entry.status }]),
    ),
  });
  const creatorCanSubmitOnBehalf = isReviewCreator && resolvedFeedbackEntries.some(
    (entry) => entry.status !== 'submitted',
  );
  const canSubmitFeedback = reviewerCanSubmitFeedback || creatorCanSubmitOnBehalf;
  const reviewerNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const contributor of contributors) {
      map.set(contributor.id, contributor.name);
    }
    for (const option of assignableOptions) {
      map.set(option.id, option.name);
    }
    return map;
  }, [assignableOptions, contributors]);
  const pendingReviewerAddNames = useMemo(
    () =>
      pendingReviewerAddIds.map((reviewerId) => reviewerNameLookup.get(reviewerId) ?? 'Reviewer'),
    [pendingReviewerAddIds, reviewerNameLookup],
  );
  const resetPendingReviewerAddState = () => {
    setPendingReviewerAddIds([]);
    setPendingReviewerAddSource(null);
    setPendingReviewerAddLabel('reviewer');
    setPendingReviewerAddCount(1);
    pendingReviewerAddConfirmRef.current = null;
  };
  const pendingReviewerNameLabel =
    pendingReviewerAddLabel || formatReviewerNamesForSentence(pendingReviewerAddNames);
  const confirmReopenLabel =
    pendingReviewerAddCount === 1
      ? 'Reviewer added. Review re-opened.'
      : 'Reviewers added. Review re-opened.';
  const runReviewerAddFlow = async ({
    reviewerIds,
    reopenReview,
    onStartSaving,
    onFinishSaving,
    onSuccess,
  }: {
    reviewerIds: string[];
    reopenReview: boolean;
    onStartSaving: () => void;
    onFinishSaving: () => void;
    onSuccess: () => void;
  }) => {
    const cleanedReviewerIds = Array.from(
      new Set(reviewerIds.map((reviewerId) => reviewerId.trim()).filter(Boolean)),
    );
    if (cleanedReviewerIds.length === 0) return;
    setReopenReviewSubmitting(true);
    onStartSaving();
    const { error, reviewersNotified } = await assignReviewersAction({
      reviewId,
      reviewerIds: cleanedReviewerIds,
      requireDecisionMaker,
      reopenReview,
    });
    onFinishSaving();
    setReopenReviewSubmitting(false);
    if (error) {
      showToast(error);
      return;
    }
    onSuccess();
    resetPendingReviewerAddState();
    setReopenReviewModalOpen(false);
    void refreshReviewPendingAccessRequests();
    if (reviewersNotified) {
      showReviewersNotifiedToast();
    } else {
      showToast(reopenReview ? confirmReopenLabel : 'Changes saved');
    }
    bumpActivityLog();
    router.refresh();
  };
  const maybeAddReviewers = ({
    reviewerIds,
    source,
    onStartSaving,
    onFinishSaving,
    onSuccess,
  }: {
    reviewerIds: string[];
    source: 'overview' | 'rhc';
    onStartSaving: () => void;
    onFinishSaving: () => void;
    onSuccess: () => void;
  }) => {
    const cleanedReviewerIds = Array.from(
      new Set(reviewerIds.map((reviewerId) => reviewerId.trim()).filter(Boolean)),
    );
    if (cleanedReviewerIds.length === 0) return;
    if (shouldReopenOnReviewerAdd) {
      setPendingReviewerAddIds(cleanedReviewerIds);
      setPendingReviewerAddSource(source);
      setPendingReviewerAddLabel(
        formatReviewerNamesForSentence(
          cleanedReviewerIds.map((reviewerId) => reviewerNameLookup.get(reviewerId) ?? 'Reviewer'),
        ),
      );
      setPendingReviewerAddCount(cleanedReviewerIds.length);
      pendingReviewerAddConfirmRef.current = async () => {
        await runReviewerAddFlow({
          reviewerIds: cleanedReviewerIds,
          reopenReview: true,
          onStartSaving,
          onFinishSaving,
          onSuccess,
        });
      };
      setReopenReviewModalOpen(true);
      return;
    }
    void runReviewerAddFlow({
      reviewerIds: cleanedReviewerIds,
      reopenReview: false,
      onStartSaving,
      onFinishSaving,
      onSuccess,
    });
  };
  const handleCreateReviewer = async ({
    name,
    email,
    role,
    includeInTeam: includeReviewerInTeam,
    reopenReview,
  }: {
    name: string;
    email: string;
    role: string;
    includeInTeam: boolean;
    reopenReview: boolean;
  }) => {
    if (!projectId.trim()) return;
    setIsCreatingTeammate(true);
    if (reopenReview) {
      setReopenReviewSubmitting(true);
    }
    if (includeReviewerInTeam && email) {
      const inviteSupabase = createSupabaseBrowserClient();
      const activeWorkspaceId = await getActiveWorkspaceId(inviteSupabase);
      if (activeWorkspaceId) {
        const inviteResult = await sendWorkspaceInvite({
          workspace_id: activeWorkspaceId,
          email,
          name,
          role: 'viewer',
        });
        if (inviteResult.status === 'error') {
          setIsCreatingTeammate(false);
          if (reopenReview) {
            setReopenReviewSubmitting(false);
          }
          showToast(inviteToastMessage(inviteResult, name, email));
          return;
        }
        showToast(inviteToastMessage(inviteResult, name, email));
      }
    }

    const { error, reviewersNotified } = await createTeammateFromReviewAction({
      reviewId,
      projectId,
      name,
      email: email || null,
      role: role.trim() || 'Stakeholder',
      requireDecisionMaker,
      includeInWorkspace: includeReviewerInTeam,
      reopenReview,
    });
    setIsCreatingTeammate(false);
    if (reopenReview) {
      setReopenReviewSubmitting(false);
    }
    if (error) {
      showToast(error);
      return;
    }
    if (reviewersNotified) {
      showReviewersNotifiedToast();
    } else if (reopenReview) {
      resetPendingReviewerAddState();
      setReopenReviewModalOpen(false);
      showToast('Reviewer added. Review re-opened.');
    } else if (!includeReviewerInTeam || !email) {
      showToast('Changes saved');
    }
    closeReviewerModal();
    if (reviewersNotified || reopenReview) {
      bumpActivityLog();
    }
    router.refresh();
  };

  const feedbackStageCtx = {
    reviewTypeNorm: normalizedReviewType,
    rawReviewStatus: displayRawStatus,
    changeRequestCount: changeRequests.length,
  };
  const overviewStage = deriveFeedbackStage(
    feedbackThreads,
    decisionMade,
    feedbackStageCtx,
  );
  const submittedFeedbackCount = feedbackThreads.filter(
    (t) => t.status === 'submitted',
  ).length;
  const reviewDeleteEligible = canDeleteReview(
    normalizedDisplayStatus,
    submittedFeedbackCount,
  );
  const reviewOptionsMenu = useMemo(() => {
    if (!showReviewKebabMenu) return null;
    const deleteDisabledTooltip =
      "This review has feedback and can't be deleted. Archive coming soon.";
    return (
      <Menu
        open={reviewMenu !== null}
        onClose={() => setReviewMenu(null)}
        anchorRef={pageKebabSectionRef}
        align="right"
        aria-label="Review options"
        type="dropdown"
      >
        {canEditReviewMenu && !isComplete ? (
          <MenuItem
            label="Edit Review"
            onClick={() => {
              setReviewMenu(null);
              setEditReviewDrawerOpen(true);
            }}
          />
        ) : null}
        {isResolved && canEditReviewMenu ? (
          <MenuItem
            label="Mark as complete"
            onClick={() => {
              setReviewMenu(null);
              setShowCompleteModal(true);
            }}
          />
        ) : null}
        {isComplete && canEditReviewMenu ? (
          <MenuItem label="Reopen review" onClick={handleReopenReview} />
        ) : null}
        {canDeleteReviewMenu && !isComplete ? (
          reviewDeleteEligible ? (
            <MenuItem
              label="Delete Review"
              destructive
              onClick={() => {
                setReviewMenu(null);
                setShowDeleteModal(true);
              }}
            />
          ) : (
            <Tooltip label={deleteDisabledTooltip} position="left" fullWidth>
              <span
                style={{ display: 'block' }}
                className="[&_[role=menuitem]]:opacity-100 [&_[role=menuitem]]:cursor-default [&_[role=menuitem]:hover]:bg-transparent [&_[role=menuitem]:focus]:bg-transparent"
              >
                <MenuItem
                  label="Delete Review"
                  disabled
                  labelStyle={{ color: 'var(--text-disabled)' }}
                />
              </span>
            </Tooltip>
          )
        ) : null}
      </Menu>
    );
  }, [
    reviewMenu,
    showReviewKebabMenu,
    canEditReviewMenu,
    canDeleteReviewMenu,
    isComplete,
    isResolved,
    handleReopenReview,
    reviewDeleteEligible,
  ]);
  const handleDeleteReviewConfirm = useCallback(async () => {
    setDeletingReview(true);
    try {
      const result = await deleteReviewAction(reviewId);
      if (!result.success) {
        showToast(result.error ?? 'Could not delete review');
        return;
      }
      setShowDeleteModal(false);
      router.push(result.redirectTo ?? '/reviews');
    } finally {
      setDeletingReview(false);
    }
  }, [reviewId, router, showToast]);
  const approveFeedbackHistoryRows =
    allFeedbackRowsProp.length > 0 ? allFeedbackRowsProp : resolvedFeedbackEntries;
  const approveFeedbackSubmissionCount = approveFeedbackHistoryRows.filter(
    (entry) => entry.status === 'submitted',
  ).length;
  const approveUniqueReviewerCount = new Set(
    approveFeedbackHistoryRows
      .filter((entry) => entry.status === 'submitted')
      .map((entry) => entry.reviewerId),
  ).size;
  const totalReviewerCount = reviewerIds.length;
  const approveRhcReviewerEntries = useMemo(() => {
    const emailByReviewerId = new Map(
      assignedReviewers.map((reviewer) => [reviewer.id, reviewer.email ?? null] as const),
    );
    return buildApproveRhcReviewerEntries(
      reviewerIds,
      resolvedFeedbackEntries,
      changeRequests,
      allFeedbackRowsProp.length > 0 ? allFeedbackRowsProp : resolvedFeedbackEntries,
      emailByReviewerId,
    );
  }, [
    assignedReviewers,
    reviewerIds,
    resolvedFeedbackEntries,
    changeRequests,
    allFeedbackRowsProp,
  ]);

  const lifecycleUi = resolveHeaderLifecycle({
    raw: displayRawStatus,
    decisionStatus: decisionData.status,
    reviewTypeNorm: normalizedReviewType,
    openChangeRequestCount: openChangeRequestsCount,
  });
  const showChangesRequestedBanner =
    normalizedReviewType === 'approve' &&
    overviewStage === 3 &&
    changeRequests.length > 0;
  const showApprovedBanner =
    normalizedReviewType === 'approve' &&
    overviewStage === 4 &&
    normStatus(displayRawStatus) === 'approved';
  const showCompareOpenCrWarning =
    normalizedReviewType === 'compare' &&
    openChangeRequestsCount > 0 &&
    (normalizedDisplayStatus === 'approved' ||
      normalizedDisplayStatus === 'complete');

  const projectIsCompleteForHeader =
    String(projectStatus ?? '').trim().toLowerCase() === 'complete';
  const canOpenHeaderStatusMenu =
    !projectIsCompleteForHeader && manualLifecycleOptions.length > 0;
  const headerStatusPill = (
    <StatusPill
      color={lifecycleUi.color}
      appearance="filled"
      prominence={
        showCompareOpenCrWarning ||
        (lifecycleUi.color === 'brand' && normalizedDisplayStatus === 'complete')
          ? 'high'
          : 'default'
      }
      leadingIcon={
        showCompareOpenCrWarning ? (
          <Warning size={16} weight="fill" aria-hidden />
        ) : undefined
      }
      label={lifecycleUi.label}
      size="lg"
      state={canOpenHeaderStatusMenu ? 'interactive' : 'default'}
      onClick={canOpenHeaderStatusMenu ? handleStatusPillToggle : undefined}
    />
  );
  const pageHeaderStatusSlot = (
    <div ref={headerStatusRef} style={{ position: 'relative' }}>
      {projectIsCompleteForHeader ? (
        <Tooltip
          label="This project is complete. Reactivate the project to edit reviews."
          position="bottom"
        >
          <span className="inline-flex">{headerStatusPill}</span>
        </Tooltip>
      ) : canOpenHeaderStatusMenu ? (
        headerStatusPill
      ) : 'tooltip' in lifecycleUi && lifecycleUi.tooltip ? (
        <Tooltip label={lifecycleUi.tooltip} position="bottom" passThroughFocus>
          <span className="inline-flex">{headerStatusPill}</span>
        </Tooltip>
      ) : (
        headerStatusPill
      )}
      {canOpenHeaderStatusMenu ? (
        <Menu
          open={headerLifecycleMenuOpen}
          onClose={() => setHeaderLifecycleMenuOpen(false)}
          anchorRef={headerStatusRef}
          align="left"
          aria-label="Review status"
        >
          {manualLifecycleOptions.map((opt) => {
            const active = normStatus(displayRawStatus) === normStatus(opt.value);
            return (
              <MenuItem
                key={opt.value}
                label={opt.label}
                active={active}
                onClick={() => void handleLifecyclePick(opt.value)}
              />
            );
          })}
        </Menu>
      ) : null}
    </div>
  );
  const canCurrentUserMakeDecision =
    normalizedReviewType !== 'approve' &&
    canMakeDecision({
      currentContributorId,
      decisionMakerReviewerId:
        normalizedReviewType === 'compare'
          ? decisionMakerReviewerId
          : assignedDecisionOwnerId,
      allReviewerFeedbackSubmitted,
      decisionMade,
    }) &&
    (normalizedReviewType !== 'compare' || isDecisionMaker);
  const currentUserHasSubmitted = feedbackEntries.some(
    (entry) => entry.reviewerId === currentContributorId && entry.status === 'submitted',
  );
  const primaryFeedbackCta = getPrimaryFeedbackCta({
    canSubmitReviewerFeedback:
      canSubmitFeedback && normStatus(rawStatus) !== 'complete',
    canCurrentUserMakeDecision,
    currentUserHasSubmittedFeedback: currentUserHasSubmitted,
  });
  const currentUserHasNotSubmitted = !currentUserHasSubmitted;
  const currentUserFeedbackDraft = useMemo(() => {
    const row = feedbackEntries.find(
      (e) => e.reviewerId === currentContributorId && e.status === 'submitted',
    );
    if (!row) return null;
    return {
      feedbackText: row.feedbackText ?? '',
      selectedOption: row.selectedOption,
    };
  }, [feedbackEntries, currentContributorId]);
  const reviewersById = new Map(assignedReviewers.map((reviewer) => [reviewer.id, reviewer]));
  const submittedReviewerIds = useMemo(
    () =>
      new Set(
        resolvedFeedbackEntries
          .filter((entry) => entry.status === 'submitted')
          .map((entry) => entry.reviewerId),
      ),
    [resolvedFeedbackEntries],
  );
  const lockedReviewerIds = useMemo(() => {
    const rows = allFeedbackRowsProp.length > 0 ? allFeedbackRowsProp : resolvedFeedbackEntries;
    return new Set(
      rows
        .filter(
          (row) =>
            row.status === 'submitted' ||
            Boolean(
              row.submittedAt ||
                row.feedbackText?.trim() ||
                row.selectedOption?.trim() ||
                row.replyText?.trim(),
            ),
        )
        .map((row) => row.reviewerId),
    );
  }, [allFeedbackRowsProp, resolvedFeedbackEntries]);

  const evaluateRemovalAutoClose = useCallback(
    (removeReviewerId: string) => {
      const remainingReviewerIds = assignedReviewers
        .map((reviewer) => reviewer.id)
        .filter((id) => id !== removeReviewerId);
      if (remainingReviewerIds.length === 0) return false;
      const allRemainingSubmitted = remainingReviewerIds.every((id) =>
        submittedReviewerIds.has(id),
      );
      if (!allRemainingSubmitted) return false;
      const remainingHasChangeRequests = changeRequests.some((request) => {
        const reviewerId = String(request.reviewer_id ?? '').trim();
        return reviewerId !== '' && remainingReviewerIds.includes(reviewerId);
      });
      return !remainingHasChangeRequests;
    },
    [assignedReviewers, changeRequests, submittedReviewerIds],
  );

  const removeReviewerNow = useCallback(
    async (reviewerId: string) => {
      setRemoveReviewerSubmitting(true);
      const { error, autoApproved } = await removeReviewerAction({
        reviewId,
        reviewerContributorId: reviewerId,
      });
      setRemoveReviewerSubmitting(false);
      if (error) {
        showToast(error);
        return;
      }
      showToast(autoApproved ? 'Reviewer removed. Review returned to Approved.' : 'Reviewer removed.');
      router.refresh();
    },
    [reviewId, router, showToast],
  );
  const handleMarkChangeRequestsCompleted = useCallback(
    async (changeRequestIds: string[]) => {
      const result = await markChangeRequestsCompletedAction({
        reviewId,
        changeRequestIds,
      });
      if (!result.success) {
        showToast(result.error ?? 'Could not mark change request as completed.');
        return;
      }
      router.refresh();
    },
    [reviewId, router, showToast],
  );
  const handleReopenChangeRequests = useCallback(
    async (changeRequestIds: string[]) => {
      const result = await reopenChangeRequestsAction({
        reviewId,
        changeRequestIds,
      });
      if (!result.success) {
        showToast(result.error ?? 'Could not reopen change request.');
        return;
      }
      router.refresh();
    },
    [reviewId, router, showToast],
  );
  const reviewersForMenu: MenuSectionsReviewer[] = assignedReviewers.map((reviewer) => ({
    id: reviewer.id,
    name: reviewer.name,
    initials: initialsFromName(reviewer.name),
  }));
  const decisionLogFeedbackRows =
    allFeedbackRowsProp.length > 0 ? allFeedbackRowsProp : resolvedFeedbackEntries;
  const approveSubmittedFeedbackForDecisionLog = useMemo(
    () =>
      normalizedReviewType === 'approve'
        ? decisionLogFeedbackRows.filter((entry) => entry.status === 'submitted')
        : [],
    [normalizedReviewType, decisionLogFeedbackRows],
  );
  const approveDecisionLogGroups = useMemo(
    () =>
      groupDecisionLogEntriesByDate(
        [...approveSubmittedFeedbackForDecisionLog].sort(
          (a, b) =>
            new Date(String(b.submittedAt ?? 0)).getTime() -
            new Date(String(a.submittedAt ?? 0)).getTime(),
        ),
      ),
    [approveSubmittedFeedbackForDecisionLog],
  );
  const alignChangeRequestLogGroups = useMemo(() => {
    if (normalizedReviewType !== 'align' || changeRequests.length === 0) {
      return [];
    }
    const sorted = [...changeRequests].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const byDate = new Map<string, ReviewChangeRequestEntry[]>();
    for (const cr of sorted) {
      const dateLabel = formatDecisionLogDateHeader(cr.created_at);
      const list = byDate.get(dateLabel) ?? [];
      list.push(cr);
      byDate.set(dateLabel, list);
    }
    return [...byDate.entries()].map(([dateLabel, rows]) => ({ dateLabel, rows }));
  }, [normalizedReviewType, changeRequests]);
  // Compare-only: every submitted concept-preference row (full history). The
  // latest submitted row per reviewer is the active preference; older rows are
  // rendered as superseded (amended) cards. Approve path above is untouched.
  const compareReviewerPreferencesForDecisionLog = useMemo(
    () =>
      normalizedReviewType === 'compare'
        ? decisionLogFeedbackRows.filter((entry) => entry.status === 'submitted')
        : [],
    [normalizedReviewType, decisionLogFeedbackRows],
  );
  // feedbackId of the most recent submitted preference per reviewer — these
  // render as the active "Preference" card; all others are "PreferenceAmended".
  const compareActivePreferenceFeedbackIds = useMemo(() => {
    const latestByReviewer = new Map<string, { id: string | null; ts: number }>();
    for (const entry of compareReviewerPreferencesForDecisionLog) {
      const ts = new Date(String(entry.submittedAt ?? 0)).getTime();
      const existing = latestByReviewer.get(entry.reviewerId);
      if (!existing || ts >= existing.ts) {
        latestByReviewer.set(entry.reviewerId, { id: entry.feedbackId, ts });
      }
    }
    const ids = new Set<string>();
    for (const { id } of latestByReviewer.values()) {
      if (id) ids.add(id);
    }
    return ids;
  }, [compareReviewerPreferencesForDecisionLog]);
  const compareDecisionLogGroups = useMemo(
    () =>
      groupDecisionLogEntriesByDate(
        [...compareReviewerPreferencesForDecisionLog].sort(
          (a, b) =>
            new Date(String(b.submittedAt ?? 0)).getTime() -
            new Date(String(a.submittedAt ?? 0)).getTime(),
        ),
      ),
    [compareReviewerPreferencesForDecisionLog],
  );

  const feedbackCards = resolvedFeedbackEntries
    .filter((entry) => {
      if (reviewType.trim().toLowerCase() !== 'approve') return true;
      const feedbackText = (entry.feedbackText ?? '').trim();
      const selectedOption = (entry.selectedOption ?? '').trim();
      return !(feedbackText === '' && selectedOption !== '');
    })
    .map((entry) => {
      const threadId = entry.feedbackId ?? `feedback-${entry.reviewerId}`;
      const thread = feedbackThreadById.get(threadId);
      if (!thread) return null;
      return {
        cardType: (entry.status === 'pending' || entry.status === 'decision-required'
          ? 'notification'
          : 'feedback') as 'feedback' | 'notification',
        id: threadId,
        reviewerId: entry.reviewerId,
        createdAt: entry.requestedAt ?? entry.submittedAt ?? '',
        thread,
      };
    })
    .filter((entry): entry is {
      cardType: 'feedback' | 'notification';
      id: string;
      reviewerId: string;
      createdAt: string;
      thread: FeedbackThread;
    } => Boolean(entry));
  const changeRequestCards = changeRequests.map((cr) => ({
    cardType: 'change_request' as const,
    id: cr.id,
    reviewerId: cr.reviewer_id,
    createdAt: cr.created_at,
    changeRequest: cr,
  }));
  const allCards = [...feedbackCards, ...changeRequestCards].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const filteredCards = allCards.filter((card) => {
    if (!activeFilters.tags.all) {
      if (card.cardType === 'feedback') {
        const hasReply = (repliesByCardId.get(card.id)?.length ?? 0) > 0;
        if (activeFilters.tags.feedback) {
          // "Feedback" should include submitted feedback cards regardless of reply count.
        } else if (activeFilters.tags.replies) {
          if (!hasReply) return false;
        } else {
          return false;
        }
      }
      if (card.cardType === 'notification' && !activeFilters.tags.notifications) {
        return false;
      }
      if (card.cardType === 'change_request' && !activeFilters.tags.changeRequests) {
        return false;
      }
    }
    if (!activeFilters.people.all) {
      if (activeFilters.people.reviewerIds.length === 0) return false;
      if (!activeFilters.people.reviewerIds.includes(card.reviewerId ?? '')) return false;
    }
    return true;
  });
  const totalCardCount =
    normalizedReviewType === 'approve'
      ? approveFeedbackSubmissionCount
      : feedbackThreads.length + changeRequests.length;
  const changeRequestLabelById = buildChangeRequestLabelById(
    changeRequests,
    decisionLogFeedbackRows,
    reviewCreatedAt,
  );
  const reviewIsLifecycleComplete = normalizedDisplayStatus === 'complete';
  const resolveArtifactTagHref = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      const match = artifacts.find(
        (artifact) =>
          artifact.label.trim() === trimmed ||
          (artifact.title?.trim() ?? '') === trimmed ||
          artifact.id === trimmed,
      );
      if (!match) return null;
      const target = resolveArtifactOpenTarget({
        linkUrl: match.linkUrl,
        imageUrl: match.imageUrl,
        fileType: resolveArtifactPreviewFileType({
          type: match.type,
          linkUrl: match.linkUrl,
          originalFileName: match.originalFileName,
          mimeType: match.mimeType,
        }),
      });
      return artifactChipHref(target);
    },
    [artifacts],
  );
  const artifactIdsWithFeedback = useMemo(
    () =>
      [
        ...artifactIdsWithReceivedFeedback(
          artifacts.map((artifact) => ({
            id: artifact.id,
            title: artifact.title,
            label: artifact.label,
          })),
          allFeedbackRowsProp.length > 0 ? allFeedbackRowsProp : feedbackEntries,
          changeRequests,
        ),
      ],
    [allFeedbackRowsProp, artifacts, changeRequests, feedbackEntries],
  );
  const finalDecisionSelectionKeys = useMemo(
    () =>
      expandArtifactSelectionKeys(
        (decisionData.selectedArtifactIds ?? []).filter(Boolean),
        artifacts.map((artifact) => ({
          id: artifact.id,
          title: artifact.title,
          label: artifact.label,
        })),
      ),
    [artifacts, decisionData.selectedArtifactIds],
  );
  const finalDecisionChangeRequests = useMemo(() => {
    if (finalDecisionSelectionKeys.size === 0) return [];
    return changeRequests
      .filter((cr) =>
        changeRequestMatchesSelection(cr.artifact_ids, finalDecisionSelectionKeys),
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      .map((cr) => ({
        id: cr.id,
        artifactIds: cr.artifact_ids,
        changeNumber:
          changeRequestLabelById.get(cr.id)?.replace(/^Change\s+/i, '') ?? '1.1',
        changesNeeded: (cr.changes_needed ?? '').trim(),
        artifactNames: labelsForArtifactSelectionKeys(cr.artifact_ids, artifacts),
      }));
  }, [
    artifacts,
    changeRequestLabelById,
    changeRequests,
    finalDecisionSelectionKeys,
  ]);
  const decisionTextTrimmed = (decisionData.text ?? '').trim();
  const approveDecisionRationaleBrief = decisionTextTrimmed
    ? decisionTextTrimmed.length > 80
      ? `${decisionTextTrimmed.slice(0, 77)}…`
      : decisionTextTrimmed
    : '';
  const decisionArtifactIds = (decisionData.selectedArtifactIds ?? []).filter(Boolean);
  const directionApprovedBannerTitle = useMemo(() => {
    if (!showCompareDirectionApprovedBanner) return 'Direction Approved';
    const parts = decisionArtifactIds.map((id) => {
      const artifact = artifacts.find(
        (a) => a.id === id || artifactSelectionKey(a) === id,
      );
      const name = artifact?.label ?? artifact?.title ?? 'Concept';
      const version = artifact?.iteration ?? 'v1';
      return `${name} (${version})`;
    });
    if (parts.length === 0) return 'Direction Approved';
    return `Direction Approved: ${parts.join(' and ')}`;
  }, [
    artifacts,
    decisionArtifactIds,
    showCompareDirectionApprovedBanner,
  ]);
  const hasSolidDecisionRecord =
    Boolean(decisionData.status) &&
    decisionTextTrimmed.length > 0 &&
    decisionArtifactIds.length > 0;
  const decisionPillUi = deriveDecisionPill(decisionData.status, normalizedReviewType);
  const decisionSummary: DecisionSummary | null = hasSolidDecisionRecord
    ? {
        pillColor: decisionPillUi.color,
        pillLabel: decisionPillUi.label,
        options: decisionArtifactIds.map((id) => {
          const artifact = artifacts.find((item) => item.id === id);
          return artifact?.label ?? artifact?.title ?? id;
        }),
        decisionText: decisionData.text ?? '',
        ownerName: decisionAttributionName,
        recordedAtIso: decisionData.madeAt ?? null,
        tradeOffNote: decisionData.tradeOffNote ?? undefined,
        tradeOffIsAI: decisionData.tradeOffIsAI ?? undefined,
      }
    : null;

  async function persistReviewArtifacts(nextArtifacts: ReviewArtifact[]) {
    const artifactsPayload = nextArtifacts.map((artifact) => ({
      kind: artifact.linkUrl ? 'link' : 'file',
      title: artifact.title,
      url: artifact.linkUrl ?? artifact.imageUrl ?? null,
      iterationLabel: artifact.iteration,
      description: artifact.description,
      originalFileName: artifact.originalFileName,
      mimeType:
        artifact.mimeType ??
        (artifact.type === 'PDF'
          ? 'application/pdf'
          : artifact.type === 'Image'
            ? 'image/jpeg'
            : 'application/figma'),
      ai_generated: artifact.aiGenerated ?? false,
    }));
    const { error } = await supabase
      .from('reviews')
      .update({ artifacts: artifactsPayload })
      .eq('id', reviewId);
    return { error };
  }

  async function persistArtifactDescription(artifactId: string, description: string) {
    const nextArtifacts = artifacts.map((artifact) =>
      artifact.id === artifactId ? { ...artifact, description } : artifact,
    );
    const { error } = await persistReviewArtifacts(nextArtifacts);
    if (error) return { success: false as const, error: error.message };
    lastSavedArtifactDescriptionsRef.current[artifactId] = description;
    showToast('Description updated');
    router.refresh();
    return { success: true as const };
  }

  async function persistTradeoffsAndLog(nextTradeoffs: Tradeoff[], event?: {
    type: 'tradeoff_added' | 'tradeoff_edited';
    tooltipText: string;
    severity?: Tradeoff['severity'];
  }) {
    const { error } = await supabase
      .from('reviews')
      .update({ tradeoffs: serializeTradeoffsForReview(nextTradeoffs) })
      .eq('id', reviewId);
    if (error) {
      setReviewDetailsSaveErrorToast(error.message);
      window.setTimeout(() => setReviewDetailsSaveErrorToast(null), 3000);
      return false;
    }
    if (event) {
      await logTimelineEventClient({
        projectId,
        reviewId,
        actorId: currentContributorId,
        eventType: event.type,
        payload: {
          review_title: title,
          tradeoff_text: event.tooltipText,
          tradeoff_severity: event.severity ?? null,
          tooltip_text: event.tooltipText,
        },
      });
      bumpActivityLog();
    }
    showToast('Changes saved');
    router.refresh();
    return true;
  }

  async function persistRelatedProblemIds(nextProblems: Problem[]) {
    const { error } = await supabase
      .from('reviews')
      .update({ related_problem_ids: nextProblems.map((problem) => problem.id) })
      .eq('id', reviewId);
    if (error) {
      setReviewDetailsSaveErrorToast(error.message);
      window.setTimeout(() => setReviewDetailsSaveErrorToast(null), 3000);
      return false;
    }
    return true;
  }

  async function handleArtifactDescriptionBlur(artifactId: string) {
    const artifact = artifacts.find((item) => item.id === artifactId);
    if (!artifact) return;
    const next = artifact.description;
    if (next === (lastSavedArtifactDescriptionsRef.current[artifactId] ?? '')) return;
    const saveResult = await persistArtifactDescription(artifactId, next);
    if (!saveResult.success) {
      setReviewDetailsSaveErrorToast(saveResult.error);
      window.setTimeout(() => setReviewDetailsSaveErrorToast(null), 3000);
    }
  }

  async function runReviewArtifactDescriptionGeneration(artifactId: string) {
    const snapshot = artifacts.find((x) => x.id === artifactId);
    if (!snapshot) return;
    const existingContent = snapshot.description.trim();
    if (!existingContent) return;

    setArtifacts((prev) =>
      prev.map((a) =>
        a.id === artifactId ? { ...a, descriptionAiState: 'loading' } : a,
      ),
    );

    const result = await generateArtifactDescription({
      existingContent,
    });

    if (!result.ok) {
      setArtifacts((prev) =>
        prev.map((a) =>
          a.id === artifactId
            ? {
                ...a,
                descriptionAiState: 'error',
                aiGenerated: false,
              }
            : a,
        ),
      );
      return;
    }

    const noChangesSuggested = result.description.trim() === existingContent;
    setArtifactAiUnavailableById((prev) => ({
      ...prev,
      [artifactId]: noChangesSuggested,
    }));

    setArtifacts((prev) =>
      prev.map((a) =>
        a.id === artifactId
          ? {
              ...a,
              description: result.description,
              descriptionAiState: 'edited',
              aiGenerated: false,
            }
          : a,
      ),
    );
    if (!noChangesSuggested) {
      const saveResult = await persistArtifactDescription(artifactId, result.description);
      if (!saveResult.success) {
        setReviewDetailsSaveErrorToast(saveResult.error);
        window.setTimeout(() => setReviewDetailsSaveErrorToast(null), 3000);
      }
    }
  }

  async function handleReviewFocusBlur() {
    if (!canEditCoreDetails || coreInteractionMode !== 'edit') return;
    const next = reviewFocus.trim();
    if (next === String(lastSavedReviewFocusRef.current ?? '').trim()) return;
    const result = await saveReviewFocusAction({
      reviewId,
      reviewFocus: next,
    });
    if (!result.success) {
      setReviewDetailsSaveErrorToast(result.error ?? 'Could not save review details');
      window.setTimeout(() => {
        setReviewDetailsSaveErrorToast((prev) =>
          prev === (result.error ?? 'Could not save review details') ? null : prev
        );
      }, 3000);
      return;
    }
    lastSavedReviewFocusRef.current = next;
    await logTimelineEventClient({
      projectId,
      reviewId,
      actorId: currentContributorId,
      eventType: 'review_focus_edited',
      payload: {
        review_title: title,
        tooltip_text: 'Review Details',
      },
    });
    showToast('Changes saved');
    router.refresh();
  }

  async function handleFeedbackReply(feedbackId: string, text: string) {
    if (!text.trim() || !currentContributorId) return;
    const result = await submitReplyAction({
      type: 'feedback',
      id: feedbackId,
      replyText: text,
      replyById: currentContributorId,
    });
    if (!result.success) return;
    router.refresh();
  }

  async function handleChangeRequestReply(changeRequestId: string) {
    const text = changeRequestReplies[changeRequestId]?.trim();
    if (!text || !currentContributorId) return;
    const result = await submitReplyAction({
      type: 'change_request',
      id: changeRequestId,
      replyText: text,
      replyById: currentContributorId,
    });
    if (!result.success) return;
    setChangeRequestReplies((prev) => ({ ...prev, [changeRequestId]: '' }));
    router.refresh();
  }

  //  Render 
  return (
    <div
      className="flex h-screen flex-row items-stretch overflow-hidden"
      style={{ backgroundColor: COLOURS.pageBg }}
      data-review-id={reviewId}
    >
      <div
        className="flex h-screen min-h-0 flex-1 flex-col overflow-hidden min-w-0"
      >
        <div ref={pageHeaderRef} className="shrink-0">
          <PageHeader
            variant="breadcrumb-tabs"
            breadcrumbSegments={[
              { label: 'Projects', href: '/projects' },
              {
                label: projectName,
                href: `/projects/${projectId}`,
              },
              { label: title },
            ]}
            pageTitle={title}
            statusSlot={pageHeaderStatusSlot}
            showStatus
            tabs={tabs}
            activeTab={uiTabIndex}
            onTabChange={(index) => {
              const internalIndex = showDecisionLog
                ? index === 2
                  ? 2
                  : index === 1
                    ? 1
                    : 0
                : index === 1
                  ? 2
                  : 0;
              setTabIndex(internalIndex);
              const params = new URLSearchParams(searchParams.toString());
              if (internalIndex === 2) params.set('tab', 'activity');
              else if (internalIndex === 1 && showDecisionLog) params.set('tab', 'decision');
              else params.delete('tab');
              const qs = params.toString();
              router.replace(qs ? `/reviews/${reviewId}?${qs}` : `/reviews/${reviewId}`);
            }}
            primaryActionSlot={reviewHeaderPrimaryAction}
            onKebab={
              showReviewKebabMenu
                ? () => {
                    setReviewMenu((m) => (m === 'header' ? null : 'header'));
                    setHeaderLifecycleMenuOpen(false);
                  }
                : undefined
            }
            kebabMenu={reviewOptionsMenu ?? undefined}
            kebabMenuExpanded={showReviewKebabMenu && reviewMenu === 'header'}
            kebabSectionRef={pageKebabSectionRef}
          />
        </div>

        {tabIndex === 2 ? (
          <main className="flex flex-1 overflow-hidden min-h-0" style={{ backgroundColor: COLOURS.pageBg }}>
            <div className="flex min-h-0 min-w-0 flex-1 overflow-y-auto">
              <ActivityTab
                reviewId={reviewId}
                reviewType={normalizedReviewType}
                refreshKey={activityRefreshKey}
                artifacts={artifacts}
                changeRequestLabelById={changeRequestLabelById}
                onNavigateToArtifact={(artifactId) => {
                  setTabIndex(0);
                  window.setTimeout(() => {
                    const target = document.getElementById(`review-artifact-${artifactId}`);
                    if (!target) return;
                    scrollLhcElementIntoView(target, { align: 'center' });
                  }, 80);
                }}
              />
            </div>
            <RightColumn
              open={rhcOpen}
              hydrated={rhcHydrated}
              headerOffset={pageHeaderHeight}
              onToggle={toggleRhc}
              feedback={feedbackThreads}
              filteredCards={filteredCards}
              pendingCount={pendingFeedbackCount}
              mode={coreInteractionMode}
              decision={decisionSummary}
              reviewId={reviewId}
              primaryFeedbackCta={primaryFeedbackCta}
              artifacts={artifacts}
              onOpenSubmitFeedbackDrawer={openSubmitFeedbackDrawer}
              onOpenFinalDecisionDrawer={openFinalDecisionDrawer}
              onSendReminder={handleBellReminder}
              sendingReminder={sendingReminder}
              isReminderRateLimited={isReminderRateLimited}
              reminderLastSentAt={lastReminderSentAt}
              canCurrentUserMakeDecision={canCurrentUserMakeDecision}
              currentContributorId={currentContributorId}
              canSubmitFeedback={canSubmitFeedback}
              isDecisionMaker={isDecisionMaker}
              showReminderBell={showReminderBell}
              allReviewerFeedbackSubmitted={allReviewerFeedbackSubmitted}
              reviewOwnerName={reviewOwnerName}
              totalCardCount={totalCardCount}
              totalReviewerCount={totalReviewerCount}
              approveFeedbackSubmissionCount={approveFeedbackSubmissionCount}
              approveUniqueReviewerCount={approveUniqueReviewerCount}
              changeRequestCount={changeRequests.length}
              changeRequests={changeRequests}
              approveRhcReviewerEntries={approveRhcReviewerEntries}
              reviewersForMenu={reviewersForMenu}
              activeFilters={activeFilters}
              setActiveFilters={setActiveFilters}
              showFilterMenu={showFilterMenu}
              setShowFilterMenu={setShowFilterMenu}
              onFeedbackReply={handleFeedbackReply}
              changeRequestReplies={changeRequestReplies}
              setChangeRequestReplies={setChangeRequestReplies}
              onChangeRequestReply={handleChangeRequestReply}
              reviewersById={reviewersById}
              contributorsById={contributorsById}
              contactDisplayById={contactDisplayById}
              changeRequestLabelById={changeRequestLabelById}
              allCardsCount={allCards.length}
              filteredCardsCount={filteredCards.length}
              hasActiveFilters={!isDefaultFilters(activeFilters)}
              repliesByCardId={repliesByCardId}
              reviewType={reviewType}
              currentUserHasNotSubmitted={currentUserHasNotSubmitted}
              reviewStatus={displayRawStatus}
              reviewClosed={normalizedDisplayStatus === 'complete'}
              comparisonDecisionPromptRowName={comparisonDecisionPromptRowName}
              showComparisonButterPromptDm={showComparisonButterPromptDm}
              showDecisionPromptReadonly={showDecisionPromptReadonly}
              decisionMakerDisplayName={decisionMakerDisplayName}
              decisionMakerContributorId={decisionMakerReviewerId}
              compareReviewFullyLocked={compareReviewFullyLocked}
              compareHideSubmitFeedback={compareHideSubmitFeedback}
              assignableContributors={assignableOptions}
              userIdByContributorId={userIdByContributorId}
              requireDecisionMaker={requireDecisionMaker}
              onAddReviewers={maybeAddReviewers}
              isReviewPaused={isReviewPaused}
              isReviewDraft={isReviewDraft}
            />
          </main>
        ) : (
          <main
            className="flex flex-1 overflow-hidden min-h-0"
            style={{ backgroundColor: COLOURS.pageBg }}
          >
          {/*  Left column: nav + sections  */}
          {tabIndex === 1 && showDecisionLog ? (
            <div className="flex flex-1 min-w-0 overflow-y-auto px-8 py-8">
              {(() => {
                  const ds = normStatus(decisionData.status);
                  const hasRecordedFinalDecision =
                    ds === 'approved' ||
                    ds === 'changes-needed' ||
                    !!(decisionData.text ?? '').trim() ||
                    (normalizedReviewType === 'compare' &&
                      normalizedDisplayStatus === 'approved');
                const finalConceptLabels =
                  decisionData.selectedArtifactIds?.map((id) => {
                    const artifact = artifacts.find((item) => item.id === id);
                    return artifact?.label ?? artifact?.title ?? id;
                  }) ?? [];
                const finalDecisionCrRecords = changeRequests.filter((cr) =>
                  finalDecisionChangeRequests.some((item) => item.id === cr.id),
                );
                const finalDecisionCrIds = finalDecisionCrRecords.map((cr) => cr.id);
                const finalDecisionCrAllCompleted =
                  finalDecisionCrRecords.length > 0 &&
                  finalDecisionCrRecords.every((cr) => Boolean(cr.completed_at));
                const canManageFinalDecisionCrs = finalDecisionCrRecords.some((cr) =>
                  canManageChangeRequestEntry(
                    cr,
                    currentContributorId,
                    isReviewCreator,
                    canEditCoreDetails,
                  ),
                );
                const renderFinalDecisionCards = () => {
                  const entries =
                    sortedDecisionSnapshots.length > 0
                      ? sortedDecisionSnapshots.filter(
                          (snapshot) => snapshot.entry_role !== 'change_request',
                        )
                      : hasRecordedFinalDecision
                        ? [
                            {
                              id: 'current-decision',
                              decision_status: decisionData.status ?? 'approved',
                              decision_comments: decisionData.text,
                              decision_selected_artifact_ids:
                                decisionData.selectedArtifactIds ?? [],
                              decision_owner_id: decisionData.ownerId ?? null,
                              decision_made_at: decisionData.madeAt ?? '',
                              superseded_at: null,
                              entry_role: 'approval' as const,
                            },
                          ]
                        : [];

                  if (entries.length === 0) return null;

                  let lastDateKey = '';
                  const nodes: React.ReactNode[] = [];

                  for (const snapshot of entries) {
                    const dateKey = decisionLogLocalDateKey(snapshot.decision_made_at);
                    const showDateHeader = dateKey !== lastDateKey;
                    if (showDateHeader) {
                      lastDateKey = dateKey;
                      nodes.push(
                        <div
                          key={`date-${dateKey}-${snapshot.id}`}
                          className="flex w-full items-center gap-3"
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[#998c82]">
                            {formatDecisionLogDateHeader(snapshot.decision_made_at)}
                          </span>
                          <div className="h-px flex-1 bg-[#e4ddd3]" />
                        </div>,
                      );
                    }

                    const snapshotOwnerName = contactNameFromMap(
                      contactDisplayById,
                      snapshot.decision_owner_id,
                      decisionAttributionName,
                    );
                    const snapshotConceptLabels =
                      snapshot.decision_selected_artifact_ids?.map((id) => {
                        const artifact = artifacts.find((item) => item.id === id);
                        return artifact?.label ?? artifact?.title ?? id;
                      }) ?? [];
                    const snapshotSelectionKeys = expandArtifactSelectionKeys(
                      snapshot.decision_selected_artifact_ids ?? [],
                      artifacts.map((artifact) => ({
                        id: artifact.id,
                        title: artifact.title,
                        label: artifact.label,
                      })),
                    );
                    const inlineChangeRows = changeRequests
                      .filter((cr) =>
                        changeRequestMatchesSelection(
                          cr.artifact_ids,
                          snapshotSelectionKeys,
                        ),
                      )
                      .sort(
                        (a, b) =>
                          new Date(a.created_at).getTime() -
                          new Date(b.created_at).getTime(),
                      );
                    const isSuperseded = Boolean(snapshot.superseded_at);
                    const snapshotChangeRequestItems = inlineChangeRows.map((cr) => {
                      const canManageRow =
                        !compareReviewFullyLocked &&
                        !isSuperseded &&
                        canManageChangeRequestEntry(
                          cr,
                          currentContributorId,
                          isReviewCreator,
                          canEditCoreDetails,
                        );
                      const rowCompleted = Boolean(cr.completed_at);
                      return {
                        id: cr.id,
                        changeNumber:
                          changeRequestLabelById
                            .get(cr.id)
                            ?.replace(/^Change\s+/i, '') ?? '1.1',
                        changesNeeded: (cr.changes_needed ?? '').trim(),
                        artifactNames: labelsForArtifactSelectionKeys(
                          cr.artifact_ids,
                          artifacts,
                        ),
                        completed: rowCompleted,
                        showRowKebab: canManageRow,
                        rowKebabLabel: rowCompleted ? 'Reopen' : 'Mark as completed',
                        onRowKebabClick: () => {
                          if (rowCompleted) {
                            void handleReopenChangeRequests([cr.id]);
                          } else {
                            void handleMarkChangeRequestsCompleted([cr.id]);
                          }
                        },
                      };
                    });

                    nodes.push(
                      <DecisionCard
                        key={snapshot.id}
                        layout="directionWithInlineChanges"
                        status="approved"
                        owner={snapshotOwnerName}
                        ownerContributorId={snapshot.decision_owner_id ?? undefined}
                        ownerContributorEmail={contributorEmailById(
                          snapshot.decision_owner_id,
                          contributorsById,
                          reviewersById,
                        )}
                        timestamp={formatDecisionCardTimestamp(
                          snapshot.decision_made_at,
                        )}
                        decisionText={(snapshot.decision_comments ?? '').trim()}
                        changeRequests={snapshotChangeRequestItems}
                        reviewLifecycleComplete={reviewIsLifecycleComplete}
                        resolveArtifactTagHref={resolveArtifactTagHref}
                        superseded={isSuperseded}
                        showKebab={
                          compareDirectionApprovedLocked &&
                          isDecisionMaker &&
                          !compareReviewFullyLocked &&
                          !isSuperseded
                        }
                        kebabActionLabel="Change direction"
                        onKebabClick={() =>
                          openFinalDecisionDrawer({ changeDirection: true })
                        }
                      />,
                    );
                  }

                  return nodes;
                };
                const finalDecisionBlock =
                  hasRecordedFinalDecision || sortedDecisionSnapshots.length > 0
                    ? renderFinalDecisionCards()
                    : null;
                const hasApproveReviewerDecisions =
                  normalizedReviewType === 'approve' &&
                  approveSubmittedFeedbackForDecisionLog.length > 0;
                const hasCompareReviewerPreferences =
                  normalizedReviewType === 'compare' &&
                  compareReviewerPreferencesForDecisionLog.length > 0;
                if (
                  !hasRecordedFinalDecision &&
                  sortedDecisionSnapshots.length === 0 &&
                  !hasApproveReviewerDecisions &&
                  !hasCompareReviewerPreferences &&
                  !(normalizedReviewType === 'align' && hasChangeRequests)
                ) {
                  return (
                    <div
                      className="flex h-[478px] w-full items-center justify-center rounded-[8px] border border-[#e4ddd3] bg-[#f3efe9]"
                    >
                      <div className="flex flex-col items-center gap-4 text-center">
                        <p className="m-0 text-[14px] font-medium text-[#998c82]">
                          A decision has not been made on this review yet.
                        </p>
                        {showDecisionLogRemindButton ? (
                          <Button
                            label="Remind Reviewers"
                            variant="secondary"
                            size="sm"
                            icon="leading"
                            iconName="notification"
                            disabled={sendingReminder || isReminderRateLimited}
                            onClick={() => {
                              void handleBellReminder();
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="flex w-full flex-col gap-6">
                    {finalDecisionBlock}
                    {hasCompareReviewerPreferences
                      ? compareDecisionLogGroups.map((group) => (
                          <div
                            key={`compare-${group.dateLabel}`}
                            className="flex w-full flex-col gap-3"
                          >
                            <div className="flex w-full items-center gap-3">
                              <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[#998c82]">
                                {group.dateLabel}
                              </span>
                              <div className="h-px flex-1 bg-[#e4ddd3]" />
                            </div>
                            {group.entries.map((entry) => {
                              const preferredKeys = String(entry.selectedOption ?? '')
                                .split(',')
                                .map((value) => value.trim())
                                .filter(Boolean);
                              const preferredLabels = labelsForArtifactSelectionKeys(
                                preferredKeys,
                                artifacts,
                              );
                              const reviewerLabel = decisionCardOwnerLabel(
                                entry,
                                contributorsById,
                              );
                              const isActivePreference = entry.feedbackId
                                ? compareActivePreferenceFeedbackIds.has(
                                    entry.feedbackId,
                                  )
                                : true;
                              const isOwnPreference = Boolean(
                                currentContributorId &&
                                  entry.reviewerId === currentContributorId,
                              );
                              const canUpdatePreference =
                                isActivePreference &&
                                isOwnPreference &&
                                !reviewIsCompletedOrClosed &&
                                !compareDirectionApproved;
                              return (
                                <div
                                  key={
                                    entry.feedbackId ??
                                    `${entry.reviewerId}-${entry.submittedAt ?? ''}`
                                  }
                                >
                                  <DecisionCard
                                    status={
                                      isActivePreference
                                        ? 'Preference'
                                        : 'PreferenceAmended'
                                    }
                                    owner={reviewerLabel}
                                    ownerContributorId={entry.reviewerId}
                                    ownerContributorEmail={contributorEmailById(
                                      entry.reviewerId,
                                      contributorsById,
                                      reviewersById,
                                    )}
                                    resolveArtifactTagHref={resolveArtifactTagHref}
                                    timestamp={formatDecisionCardTimestamp(
                                      entry.submittedAt,
                                    )}
                                    decisionText={(entry.feedbackText ?? '').trim()}
                                    selectedConcepts={preferredLabels}
                                    showKebab={canUpdatePreference}
                                    kebabActionLabel="Update preference"
                                    onKebabClick={() =>
                                      openSubmitFeedbackDrawer({
                                        prefill: true,
                                        targetReviewerId: entry.reviewerId,
                                        feedbackEntryId:
                                          entry.feedbackId ??
                                          `feedback-${entry.reviewerId}`,
                                      })
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ))
                      : null}
                    {hasApproveReviewerDecisions
                      ? approveDecisionLogGroups.map((group) => (
                          <div
                            key={group.dateLabel}
                            className="flex w-full flex-col gap-3"
                          >
                            <div className="flex w-full items-center gap-3">
                              <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[#998c82]">
                                {group.dateLabel}
                              </span>
                              <div className="h-px flex-1 bg-[#e4ddd3]" />
                            </div>
                            {group.entries.map((entry) => {
                              const selectedKeys = String(entry.selectedOption ?? '')
                                .split(',')
                                .map((value) => value.trim())
                                .filter(Boolean);
                              const approvedLabels = labelsForArtifactSelectionKeys(
                                selectedKeys,
                                artifacts,
                              );
                              const submissionChangeRequests =
                                changeRequestsForFeedbackSubmission(
                                  entry,
                                  decisionLogFeedbackRows,
                                  changeRequests,
                                  reviewCreatedAt,
                                );
                              const trimmedFeedbackText = (entry.feedbackText ?? '').trim();
                              const hasApprovals = approvedLabels.length > 0;
                              const hasChangeRequests =
                                submissionChangeRequests.length > 0;
                              const decisionChangeRequests = hasChangeRequests
                                ? submissionChangeRequests.map((cr) => ({
                                    id: cr.id,
                                    changeNumber:
                                      changeRequestLabelById
                                        .get(cr.id)
                                        ?.replace(/^Change\s+/i, '') ?? '1.1',
                                    changesNeeded: (cr.changes_needed ?? '').trim(),
                                    artifactNames: labelsForArtifactSelectionKeys(
                                      cr.artifact_ids,
                                      artifacts,
                                    ),
                                  }))
                                : undefined;
                              const changeRequestIds = submissionChangeRequests.map(
                                (cr) => cr.id,
                              );
                              const changeRequestAllCompleted =
                                submissionChangeRequests.length > 0 &&
                                submissionChangeRequests.every((cr) =>
                                  Boolean(cr.completed_at),
                                );
                              const canManageSubmissionChangeRequests =
                                submissionChangeRequests.some((cr) =>
                                  canManageChangeRequestEntry(
                                    cr,
                                    currentContributorId,
                                    isReviewCreator,
                                    canEditCoreDetails,
                                  ),
                                );
                              // Mixed submissions (approved one artifact + requested a
                              // change on another) render a separate card per action so
                              // the approval is never swallowed by the change request.
                              const decisionLogCards: Array<{
                                key: string;
                                status: 'approved' | 'changes-needed';
                                decisionText: string;
                                artifactTags?: string[];
                                changeRequests?: Array<{
                                  changeNumber: string;
                                  changesNeeded: string;
                                  artifactNames: string[];
                                }>;
                              }> = [];
                              if (hasApprovals) {
                                decisionLogCards.push({
                                  key: 'approved',
                                  status: 'approved',
                                  decisionText:
                                    !hasChangeRequests && trimmedFeedbackText
                                      ? trimmedFeedbackText
                                      : `Approved ${approvedLabels.join(', ')}.`,
                                  artifactTags: approvedLabels,
                                });
                              }
                              if (hasChangeRequests) {
                                decisionLogCards.push({
                                  key: 'changes-needed',
                                  status: 'changes-needed',
                                  decisionText:
                                    trimmedFeedbackText || 'Changes requested.',
                                  changeRequests: decisionChangeRequests,
                                });
                              }
                              if (decisionLogCards.length === 0) {
                                decisionLogCards.push({
                                  key: 'approved',
                                  status: 'approved',
                                  decisionText:
                                    trimmedFeedbackText || 'Reviewer approval recorded.',
                                });
                              }
                              const decisionLogBaseKey =
                                entry.feedbackId ??
                                `${entry.reviewerId}-${entry.submittedAt ?? ''}`;
                              return decisionLogCards.map((card) => {
                                const isChangesNeededCard = card.status === 'changes-needed';
                                const showUpdateFeedbackKebab =
                                  !isChangesNeededCard &&
                                  (entry.reviewerId === currentContributorId ||
                                    isReviewCreator);
                                const showChangeRequestKebab =
                                  isChangesNeededCard && canManageSubmissionChangeRequests;
                                return (
                                <div
                                  key={`${decisionLogBaseKey}-${card.key}`}
                                  id={
                                    entry.feedbackId
                                      ? `decision-feedback-${entry.feedbackId}-${card.key}`
                                      : undefined
                                  }
                                >
                                  <DecisionCard
                                    status={card.status}
                                    owner={decisionCardOwnerLabel(entry, contributorsById)}
                                    timestamp={formatDecisionCardTimestamp(entry.submittedAt)}
                                    decisionText={card.decisionText}
                                    artifactTags={card.artifactTags}
                                    changeRequests={card.changeRequests}
                                    reviewLifecycleComplete={reviewIsLifecycleComplete}
                                    resolveArtifactTagHref={resolveArtifactTagHref}
                                    completed={
                                      isChangesNeededCard && changeRequestAllCompleted
                                    }
                                    showKebab={
                                      showUpdateFeedbackKebab || showChangeRequestKebab
                                    }
                                    kebabActionLabel={
                                      isChangesNeededCard
                                        ? changeRequestAllCompleted
                                          ? 'Reopen'
                                          : 'Mark as completed'
                                        : 'Submit additional feedback'
                                    }
                                    onKebabClick={
                                      isChangesNeededCard
                                        ? () => {
                                            if (changeRequestAllCompleted) {
                                              void handleReopenChangeRequests(
                                                changeRequestIds,
                                              );
                                            } else {
                                              void handleMarkChangeRequestsCompleted(
                                                changeRequestIds,
                                              );
                                            }
                                          }
                                        : () =>
                                            openSubmitFeedbackDrawer({
                                              prefill: true,
                                              targetReviewerId: entry.reviewerId,
                                              feedbackEntryId:
                                                entry.feedbackId ??
                                                `feedback-${entry.reviewerId}`,
                                            })
                                    }
                                  />
                                </div>
                                );
                              });
                            })}
                          </div>
                        ))
                      : null}
                    {normalizedReviewType === 'align' && hasChangeRequests
                      ? alignChangeRequestLogGroups.map((group) => (
                          <div
                            key={`align-cr-${group.dateLabel}`}
                            className="flex w-full flex-col gap-3"
                          >
                            <div className="flex w-full items-center gap-3">
                              <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[#998c82]">
                                {group.dateLabel}
                              </span>
                              <div className="h-px flex-1 bg-[#e4ddd3]" />
                            </div>
                            {group.rows.map((cr) => {
                              const ownerLabel = reviewerNameForChangeRequest(
                                cr,
                                reviewersById,
                                contributorsById,
                              );
                              const changeRequestIds = [cr.id];
                              const changeRequestAllCompleted = Boolean(cr.completed_at);
                              const canManageCr = canManageChangeRequestEntry(
                                cr,
                                currentContributorId,
                                isReviewCreator,
                                canEditCoreDetails,
                              );
                              return (
                                <DecisionCard
                                  key={cr.id}
                                  status="changes-needed"
                                  owner={ownerLabel}
                                  ownerContributorId={cr.reviewer_id ?? undefined}
                                  ownerContributorEmail={contributorEmailById(
                                    cr.reviewer_id,
                                    contributorsById,
                                    reviewersById,
                                  )}
                                  timestamp={formatDecisionCardTimestamp(cr.created_at)}
                                  decisionText={(cr.changes_needed ?? '').trim()}
                                  reviewLifecycleComplete={reviewIsLifecycleComplete}
                                  resolveArtifactTagHref={resolveArtifactTagHref}
                                  changeRequests={[
                                    {
                                      id: cr.id,
                                      changeNumber:
                                        changeRequestLabelById
                                          .get(cr.id)
                                          ?.replace(/^Change\s+/i, '') ?? '1',
                                      changesNeeded: (cr.changes_needed ?? '').trim(),
                                      artifactNames: labelsForArtifactSelectionKeys(
                                        cr.artifact_ids,
                                        artifacts,
                                      ),
                                      completed: Boolean(cr.completed_at),
                                    },
                                  ]}
                                  completed={Boolean(cr.completed_at)}
                                  showKebab={canManageCr}
                                  kebabActionLabel={
                                    changeRequestAllCompleted
                                      ? 'Reopen'
                                      : 'Mark as completed'
                                  }
                                  onKebabClick={() => {
                                    if (changeRequestAllCompleted) {
                                      void handleReopenChangeRequests(changeRequestIds);
                                    } else {
                                      void handleMarkChangeRequestsCompleted(
                                        changeRequestIds,
                                      );
                                    }
                                  }}
                                />
                              );
                            })}
                          </div>
                        ))
                      : null}
                    <div className="shrink-0 h-8" aria-hidden="true" />
                  </div>
                );
                })()}
            </div>
          ) : (
          <div
            className="flex flex-1 flex-row min-w-0 overflow-hidden pl-8"
          >
            {/* Left nav (sticky) */}
            <aside
              className="sticky top-0 self-start shrink-0 flex flex-col gap-1 pr-6 pt-8 pb-8"
              style={{ width: 170 }}
            >
              {NAV_SECTIONS.map((s) => {
                const isActive = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => scrollToSection(s.id)}
                    className="flex items-center text-left transition-colors"
                    style={{
                      height: 44,
                      paddingLeft: 12,
                      paddingRight: 12,
                      paddingTop: 8,
                      paddingBottom: 8,
                      borderRadius: 4,
                      backgroundColor: isActive ? COLOURS.borderSubtle : COLOURS.surfaceCard,
                      color: isActive ? COLOURS.textPrimary : COLOURS.textSecondary,
                      fontWeight: isActive ? 500 : 400,
                      fontSize: 13,
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}

              <div className="mt-3 w-full">
                <Button
                  label="Back to Top"
                  variant="ghost"
                  size="sm"
                  icon="leading"
                  iconName="chevron-up"
                  onClick={scrollToTop}
                  className="w-full justify-start"
                />
              </div>
            </aside>

            {/* Main scroll area: first section is Review Details, then Designs. */}
            <div
              ref={scrollRootRef}
              className="flex min-h-0 min-w-0 flex-1 overflow-y-auto"
            >
              <div className="flex min-h-full min-w-0 flex-1 flex-col gap-8 pr-8 pt-8 pb-8">
              {showCompareDirectionApprovedBanner ? (
                <Alert
                  sentiment="success"
                  prominence="high"
                  title={directionApprovedBannerTitle}
                  actionLabel="View Decision Log"
                  onAction={openDecisionLogTab}
                  dismissible={false}
                  className="w-full"
                />
              ) : normalizedReviewType !== 'approve' &&
                !showCompareDirectionApprovedBanner &&
                ['approved', 'changes-needed', 'needs-changes', 'rejected'].includes(
                  normStatus(decisionData.status),
                ) ? (
                <Alert
                  sentiment={
                    normStatus(decisionData.status) === 'approved'
                      ? 'success'
                      : normStatus(decisionData.status) === 'rejected'
                        ? 'danger'
                        : 'base'
                  }
                  prominence="high"
                  title={
                    normStatus(decisionData.status) === 'approved'
                      ? 'Approved'
                      : normStatus(decisionData.status) === 'rejected'
                        ? 'Rejected'
                        : 'Changes Needed'
                  }
                  actionLabel="View Decision Log"
                  onAction={openDecisionLogTab}
                  dismissible={false}
                  className="w-full"
                />
              ) : null}
              {showChangesRequestedBanner ? (
                <Alert
                  sentiment="warning"
                  prominence="high"
                  title="Needs Changes"
                  dismissible={false}
                  className="w-full"
                />
              ) : null}
              {showApprovedBanner ? (
                <Alert
                  sentiment="success"
                  prominence="high"
                  title="Approved"
                  dismissible={false}
                  className="w-full"
                />
              ) : null}
              <section id="review-focus" className="flex flex-col gap-3 scroll-mt-6">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <SectionHeading>Review Details</SectionHeading>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    {canEditCoreDetails && canEditReview && !hasFeedbackSubmitted ? (
                      <button
                        type="button"
                        onClick={() => setShowEditTypeModal(true)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                        }}
                        aria-label="Edit review type"
                      >
                        <StatusPill
                          color="mushroom"
                          appearance="outline"
                          label={reviewTypeDisplayLabel}
                          size="sm"
                          prominence="default"
                          labelTypography="body"
                        />
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ color: '#6b5e55', flexShrink: 0 }}>
                          <path
                            d="M9.916 2.042a1.237 1.237 0 0 1 1.75 1.75l-5.25 5.25-2.333.583.583-2.333 5.25-5.25Z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                          <path d="m8.75 3.208 2.042 2.042" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                      </button>
                    ) : (
                      <Tooltip
                        label={
                          canEditCoreDetails && hasFeedbackSubmitted
                            ? 'Review type cannot be changed once feedback has been submitted'
                            : reviewTypeViewerTooltip
                        }
                        position="left"
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                          <StatusPill
                            color="mushroom"
                            appearance="outline"
                            label={reviewTypeDisplayLabel}
                            size="sm"
                            prominence="default"
                            labelTypography="body"
                          />
                          <Icon name="info" size={14} style={{ color: '#6b5e55', flexShrink: 0 }} />
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </div>
                {coreInteractionMode === 'edit' && !reviewFieldsReadOnly && canEditReview ? (
                  <>
                    <div>
                      <Textarea
                        label="Review details"
                        showLabel={false}
                        placeholder="What initial focus or questions do you have for the reviewers?"
                        value={reviewFocus}
                        onChange={(e) => setReviewFocus(e.target.value)}
                        onBlur={() => {
                          void handleReviewFocusBlur();
                        }}
                        variant="form-fixed"
                        size="md"
                      />
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#6b5e55' }}>
                      {reviewDetailsAttributionLine({
                        ownerName: reviewOwnerName,
                        createdAt: reviewCreatedAt,
                        updatedAt: reviewUpdatedAt,
                      })}
                    </p>
                  </>
                ) : reviewFocus.trim() ? (
                  <>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        color: '#2e1c1c',
                        lineHeight: 1.5,
                        letterSpacing: '0.26px',
                      }}
                    >
                      {reviewFocus}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#6b5e55' }}>
                      {reviewDetailsAttributionLine({
                        ownerName: reviewOwnerName,
                        createdAt: reviewCreatedAt,
                        updatedAt: reviewUpdatedAt,
                      })}
                    </p>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        backgroundColor: '#f3efe9',
                        border: '1px solid #e4ddd3',
                        borderRadius: 8,
                        height: 68,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#998c82' }}>
                        No details have been provided for this review.
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#6b5e55' }}>
                      {reviewDetailsAttributionLine({
                        ownerName: reviewOwnerName,
                        createdAt: reviewCreatedAt,
                        updatedAt: reviewUpdatedAt,
                      })}
                    </p>
                  </>
                )}
              </section>

              <section id="designs" className="flex flex-col gap-4 scroll-mt-6">
                {artifacts.map((artifact) => (
                  <div key={artifact.id} id={`review-artifact-${artifact.id}`} className="scroll-mt-6">
                  <FigmaSnapshotMediaChrome artifact={artifact}>
                    {({
                      mediaViewMode,
                      previewOverlay,
                      onSnapshotImageClick,
                      snapshotUrl,
                    }) => (
                  <ArtifactPreview
                    size="large"
                    fileType={resolveArtifactPreviewFileType({
                      type: artifact.type,
                      linkUrl: artifact.linkUrl,
                      originalFileName: artifact.originalFileName,
                      mimeType: artifact.mimeType,
                    })}
                    mode="readonly"
                    enableOpenInteraction
                    showDetails
                    fileName={artifact.label}
                    lastEdited="Edited recently"
                    artifactName={artifact.label}
                    iteration={artifact.iteration}
                    description={artifact.description}
                    imageUrl={artifact.imageUrl ?? undefined}
                    linkUrl={artifact.linkUrl ?? undefined}
                    snapshotUrl={snapshotUrl}
                    mediaViewMode={mediaViewMode}
                    onSnapshotImageClick={onSnapshotImageClick}
                    previewOverlay={previewOverlay}
                    iterationOptions={["v1", "v2", "v3", "v4", "v5"]}
                    onArtifactNameChange={(name) =>
                      setArtifacts((prev) =>
                        prev.map((a) =>
                          a.id === artifact.id ? { ...a, label: name } : a
                        )
                      )
                    }
                    onIterationChange={(iter) =>
                      setArtifacts((prev) =>
                        prev.map((a) =>
                          a.id === artifact.id ? { ...a, iteration: iter } : a
                        )
                      )
                    }
                    onDescriptionChange={(desc) =>
                      {
                        setArtifactAiUnavailableById((prev) => ({
                          ...prev,
                          [artifact.id]: false,
                        }));
                      setArtifacts((prev) =>
                        prev.map((a) => {
                          if (a.id !== artifact.id) return a;
                          const next = { ...a, description: desc };
                          if (a.descriptionAiState === 'ai_generated') {
                            next.descriptionAiState = 'edited';
                          } else if (
                            a.aiGenerated &&
                            (a.descriptionAiState === 'idle' ||
                              a.descriptionAiState === undefined)
                          ) {
                            next.descriptionAiState = 'edited';
                          }
                          return next;
                        })
                        );
                    }
                    }
                    onDescriptionBlur={() => void handleArtifactDescriptionBlur(artifact.id)}
                    descriptionAiState={artifact.descriptionAiState ?? 'idle'}
                    persistedAiGenerated={artifact.aiGenerated === true}
                    requireUserEditBeforeOptimise
                    aiEditTrackingKey={artifact.id}
                    canGenerateAiDescription={
                      coreInteractionMode === 'edit' &&
                      !reviewFieldsReadOnly &&
                      canEditReview &&
                      !artifactAiUnavailableById[artifact.id] &&
                      artifact.description.trim().length > 0 &&
                      Boolean(
                        artifact.label.trim() &&
                          (artifact.linkUrl?.trim() ||
                            artifact.imageUrl?.trim() ||
                            artifact.originalFileName?.trim()),
                      )
                    }
                    onRegenerateDescription={
                      coreInteractionMode === 'edit' && !reviewFieldsReadOnly && canEditReview
                        ? () => void runReviewArtifactDescriptionGeneration(artifact.id)
                        : undefined
                    }
                  />
                    )}
                  </FigmaSnapshotMediaChrome>
                  </div>
                ))}
              </section>

              <section id="problems" className="flex flex-col gap-3 scroll-mt-6">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <SectionHeading>Problems</SectionHeading>
                  <p
                    style={{
                      fontSize: 13,
                      color: '#6b5e55',
                      fontWeight: 400,
                      margin: 0,
                    }}
                  >
                    Problem statements related to this review.
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {problems.map((p) => (
                    <ProblemRow
                      key={p.id}
                      problem={p}
                      mode={
                        reviewFieldsReadOnly || !canEditReview
                          ? 'view-only'
                          : coreInteractionMode
                      }
                      open={openKebabId === p.id}
                      onToggleMenu={() =>
                        setOpenKebabId((current) => (current === p.id ? null : p.id))
                      }
                      menuRef={(node) => {
                        kebabRefs.current[p.id] = node;
                      }}
                      onEdit={() => {
                        setEditingProblem(p);
                        setEditText(p.text);
                        setIncludeInProject(true);
                        setProblemModalOpen(true);
                        setOpenKebabId(null);
                      }}
                      onDelete={() => {
                        const nextProblems = problems.filter((x) => x.id !== p.id);
                        setProblems(nextProblems);
                        void (async () => {
                          const persisted = await persistRelatedProblemIds(nextProblems);
                          if (persisted) {
                            showToast('Changes saved');
                            router.refresh();
                          }
                        })();
                        setOpenKebabId(null);
                      }}
                      onCloseMenu={() => setOpenKebabId(null)}
                    />
                  ))}
                </div>

                {problems.length === 0 && (
                  <div
                    style={{
                      backgroundColor: '#f3efe9',
                      border: '1px solid #e4ddd3',
                      borderRadius: 8,
                      height: 68,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#998c82' }}>
                      No problems have been linked to this review.
                    </span>
                  </div>
                )}

                {coreInteractionMode === 'edit' &&
                  canEditReview &&
                  !compareDirectionApprovedLocked &&
                  !compareReviewFullyLocked &&
                  !reviewFieldsReadOnly && (
                  <div
                    ref={(node) => {
                      addButtonRef.current = node;
                      selectMenuContainerRef.current = node;
                    }}
                    style={{ position: 'relative', width: 400, maxWidth: 400 }}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon="leading"
                      iconName="plus"
                      label="Add problem"
                      style={{ alignSelf: 'flex-start' }}
                      aria-expanded={selectMenuOpen}
                      aria-haspopup="menu"
                      onClick={() => setSelectMenuOpen((prev) => !prev)}
                    />
                    <Menu
                      open={selectMenuOpen}
                      onClose={() => setSelectMenuOpen(false)}
                      anchorRef={addButtonRef}
                      align="left"
                      type="multi-select"
                      footerAction={{
                        type: 'button',
                        label: 'Done',
                        additionalLinkLabel: 'Create a new problem',
                        onClick: async () => {
                          const toAdd = allProjectProblems.filter((problem) =>
                            selectedFromProject.includes(problem.id)
                          );
                          const nextProblems = [
                            ...problems,
                            ...toAdd
                              .filter((candidate) => !problems.some((row) => row.id === candidate.id))
                              .map((candidate) => ({ ...candidate, selected: true })),
                          ];
                          setProblems(nextProblems);
                          const persisted = await persistRelatedProblemIds(nextProblems);
                          if (persisted) {
                            await Promise.all(
                              toAdd.map((problem) =>
                                logTimelineEventClient({
                                  projectId,
                                  reviewId,
                                  actorId: currentContributorId,
                                  eventType: 'problem_added',
                                  payload: {
                                    review_title: title,
                                    problem_text: problem.text,
                                    tooltip_text: problem.text,
                                  },
                                }),
                              ),
                            );
                            showToast('Changes saved');
                            router.refresh();
                          }
                          setSelectedFromProject([]);
                          setSelectMenuOpen(false);
                        },
                        onAdditionalLink: () => {
                          setSelectMenuOpen(false);
                          setEditingProblem(null);
                          setEditText('');
                          setNewProblemText('');
                          setIncludeInProject(true);
                          setProblemModalOpen(true);
                        },
                      }}
                    >
                      {remainingProblems.length === 0 ? (
                        <MenuItem label="All project problems have been added." disabled />
                      ) : (
                        remainingProblems.map((problem) => (
                          <li key={problem.id} role="none" style={{ listStyle: 'none' }}>
                            <label
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                padding: '8px 12px',
                                cursor: 'pointer',
                                width: '100%',
                              }}
                            >
                              <Checkbox
                                id={`select-problem-${problem.id}`}
                                label=""
                                checked={selectedFromProject.includes(problem.id)}
                                onChange={(checked) => {
                                  setSelectedFromProject((prev) =>
                                    checked
                                      ? [...prev, problem.id]
                                      : prev.filter((id) => id !== problem.id)
                                  );
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 14,
                                  fontWeight: 500,
                                  color: '#2e1c1c',
                                  flex: 1,
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                  lineHeight: 1.5,
                                  paddingTop: 2,
                                }}
                              >
                                {problem.text}
                              </span>
                            </label>
                          </li>
                        ))
                      )}
                    </Menu>
                  </div>
                )}
              </section>

              <section id="tradeoffs" className="flex flex-col gap-3 scroll-mt-6">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <SectionHeading>Tradeoffs &amp; Risks</SectionHeading>
                  <p
                    style={{
                      fontSize: 13,
                      color: '#6b5e55',
                      fontWeight: 400,
                      margin: 0,
                    }}
                  >
                    Understanding tradeoffs and their associated risks.
                  </p>
                </div>

                {tradeoffs.length === 0 && (
                  <div
                    style={{
                      backgroundColor: '#f3efe9',
                      border: '1px solid #e4ddd3',
                      borderRadius: 8,
                      padding: 24,
                      textAlign: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#998c82',
                      }}
                    >
                      Add tradeoffs as they surface.
                    </span>
                  </div>
                )}

                {tradeoffs.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {tradeoffs.map((t) => {
                      const canEditThisTradeoff = canEditTradeoff(
                        t,
                        currentContributorId,
                        canEditCoreDetails,
                      );
                      const tradeoffEditable =
                        canEditThisTradeoff &&
                        canEditReview &&
                        !reviewFieldsReadOnly &&
                        coreInteractionMode === 'edit';
                      return (
                        <TradeoffCard
                          key={t.id}
                          label={t.label}
                          severity={t.severity}
                          artifactLabel={resolveTradeoffArtifactLabel(t, artifacts)}
                          layout="inline"
                          interactive={tradeoffEditable}
                          showKebab={tradeoffEditable}
                          kebabOpen={openTradeoffMenuId === t.id}
                          menuRef={(node) => {
                            tradeoffMenuRefs.current[t.id] = node;
                          }}
                          onKebabToggle={() =>
                            setOpenTradeoffMenuId((current) =>
                              current === t.id ? null : t.id,
                            )
                          }
                          onEdit={() => {
                            setEditingTradeoff(t);
                            setNewTradeoffText(t.label);
                            setNewTradeoffSeverity(t.severity);
                            setTradeoffSelectedArtifactIds(
                              resolveTradeoffArtifactIds(t, artifacts),
                            );
                            setTradeoffArtifactPickerValue('');
                            setTradeoffModalOpen(true);
                            setOpenTradeoffMenuId(null);
                          }}
                          onDelete={async () => {
                            const nextTradeoffs = tradeoffs.filter(
                              (tradeoff) => tradeoff.id !== t.id,
                            );
                            setTradeoffs(nextTradeoffs);
                            const { error } = await supabase
                              .from('reviews')
                              .update({
                                tradeoffs: serializeTradeoffsForReview(nextTradeoffs),
                              })
                              .eq('id', reviewId);
                            if (!error) {
                              showToast('Changes saved');
                              router.refresh();
                            }
                            setOpenTradeoffMenuId(null);
                          }}
                          onKebabClose={() => setOpenTradeoffMenuId(null)}
                        />
                      );
                    })}
                  </div>
                )}

                {canAddTradeoffs && canEditReview && !compareReviewFullyLocked && !reviewFieldsReadOnly && (
                  <Button
                    label="Add a tradeoff"
                    variant="ghost"
                    size="sm"
                    icon="leading"
                    iconName="plus"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => {
                      setEditingTradeoff(null);
                      setTradeoffModalOpen(true);
                    }}
                  />
                )}
              </section>

              <section id="reviewers" className="flex flex-col gap-3 scroll-mt-6 pb-24">
                <div className="flex flex-wrap items-center gap-2">
                  <SectionHeading>Reviewers</SectionHeading>
                  {canEditReviewMenu && reviewPendingAccessRequestCount > 0 ? (
                    <AccessRequestPendingPill
                      count={reviewPendingAccessRequestCount}
                      requesterNames={reviewPendingAccessRequesterNames}
                    />
                  ) : null}
                </div>

                {reviewers.length === 0 && (
                  <div
                    style={{
                      backgroundColor: '#f3efe9',
                      border: '1px solid #e4ddd3',
                      borderRadius: 8,
                      height: 68,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#998c82',
                      }}
                    >
                      Add contributors who should provide feedback.
                    </span>
                  </div>
                )}

                {reviewers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {[...reviewers]
                      .sort((a, b) =>
                        a.variant === 'lilac' ? -1 : b.variant === 'lilac' ? 1 : 0
                      )
                      .map((r) => (
                        <ReviewerChip
                          key={r.id}
                          reviewer={r}
                          mode={coreInteractionMode}
                          reviewType={normalizedReviewType}
                          removable={!lockedReviewerIds.has(r.id)}
                          onRemove={async () => {
                            const reviewerSubmitted = submittedReviewerIds.has(r.id);
                            const statusForRemoval = normStatus(displayRawStatus);
                            const requiresConfirm =
                              !reviewerSubmitted &&
                              (statusForRemoval === 'in-review' ||
                                statusForRemoval === 'needs-changes' ||
                                statusForRemoval === 'changes-needed');
                            if (requiresConfirm) {
                              setPendingReviewerRemoval({
                                id: r.id,
                                name: r.name,
                                autoCloseOnRemoval: evaluateRemovalAutoClose(r.id),
                              });
                              setRemoveReviewerModalOpen(true);
                              return;
                            }
                            await removeReviewerNow(r.id);
                          }}
                        />
                      ))}
                  </div>
                )}

                {coreInteractionMode === 'edit' &&
                  !compareDirectionApprovedLocked &&
                  !compareReviewFullyLocked &&
                  canEditReviewMenu &&
                  !isReviewPaused && (
                  <AddReviewerDropdown
                    workspaceId={reviewWorkspaceId}
                    assignableContributors={assignableOptions}
                    disabled={reviewIsCompletedOrClosed}
                    disabledTooltip="Reopen this review to add reviewers"
                    saving={savingReviewers}
                    showHelperText={showHelperText}
                    helperText={helperText}
                    onOpenCreateTeammateModal={() => setReviewerModalOpen(true)}
                    onAddReviewers={({ reviewerIds, onSuccess }) => {
                      maybeAddReviewers({
                        reviewerIds,
                        source: 'overview',
                        onStartSaving: () => setSavingReviewers(true),
                        onFinishSaving: () => setSavingReviewers(false),
                        onSuccess,
                      });
                    }}
                  />
                )}
              </section>
              <div className="shrink-0 h-8" aria-hidden="true" />
              </div>
            </div>
          </div>
          )}

          {/*  Right column: Feedback  */}
          <RightColumn
            open={rhcOpen}
            hydrated={rhcHydrated}
            headerOffset={pageHeaderHeight}
            onToggle={toggleRhc}
            feedback={feedbackThreads}
            filteredCards={filteredCards}
            pendingCount={pendingFeedbackCount}
            mode={coreInteractionMode}
            decision={decisionSummary}
            reviewId={reviewId}
            primaryFeedbackCta={primaryFeedbackCta}
            artifacts={artifacts}
            onOpenSubmitFeedbackDrawer={openSubmitFeedbackDrawer}
            onOpenFinalDecisionDrawer={openFinalDecisionDrawer}
            onSendReminder={handleBellReminder}
            sendingReminder={sendingReminder}
            isReminderRateLimited={isReminderRateLimited}
            reminderLastSentAt={lastReminderSentAt}
            canCurrentUserMakeDecision={canCurrentUserMakeDecision}
            currentContributorId={currentContributorId}
            canSubmitFeedback={canSubmitFeedback}
            isDecisionMaker={isDecisionMaker}
            showReminderBell={showReminderBell}
            allReviewerFeedbackSubmitted={allReviewerFeedbackSubmitted}
            reviewOwnerName={reviewOwnerName}
            totalCardCount={totalCardCount}
            totalReviewerCount={totalReviewerCount}
            approveFeedbackSubmissionCount={approveFeedbackSubmissionCount}
            approveUniqueReviewerCount={approveUniqueReviewerCount}
            changeRequestCount={changeRequests.length}
            changeRequests={changeRequests}
            approveRhcReviewerEntries={approveRhcReviewerEntries}
            reviewersForMenu={reviewersForMenu}
            activeFilters={activeFilters}
            setActiveFilters={setActiveFilters}
            showFilterMenu={showFilterMenu}
            setShowFilterMenu={setShowFilterMenu}
            onFeedbackReply={handleFeedbackReply}
            changeRequestReplies={changeRequestReplies}
            setChangeRequestReplies={setChangeRequestReplies}
            onChangeRequestReply={handleChangeRequestReply}
            reviewersById={reviewersById}
            contributorsById={contributorsById}
            contactDisplayById={contactDisplayById}
            changeRequestLabelById={changeRequestLabelById}
            allCardsCount={allCards.length}
            filteredCardsCount={filteredCards.length}
            hasActiveFilters={!isDefaultFilters(activeFilters)}
            repliesByCardId={repliesByCardId}
            reviewType={reviewType}
            currentUserHasNotSubmitted={currentUserHasNotSubmitted}
            reviewStatus={displayRawStatus}
            reviewClosed={normalizedDisplayStatus === 'complete'}
            comparisonDecisionPromptRowName={comparisonDecisionPromptRowName}
            showComparisonButterPromptDm={showComparisonButterPromptDm}
            showDecisionPromptReadonly={showDecisionPromptReadonly}
            decisionMakerDisplayName={decisionMakerDisplayName}
            decisionMakerContributorId={decisionMakerReviewerId}
            compareReviewFullyLocked={compareReviewFullyLocked}
            compareHideSubmitFeedback={compareHideSubmitFeedback}
            assignableContributors={assignableOptions}
            userIdByContributorId={userIdByContributorId}
            requireDecisionMaker={requireDecisionMaker}
            onAddReviewers={maybeAddReviewers}
            isReviewPaused={isReviewPaused}
            isReviewDraft={isReviewDraft}
          />
          </main>
        )}
      </div>
      {showFeedbackDrawer && (
        <SubmitFeedbackDrawer
          review={{
            id: reviewId,
            reviewType,
            reviewFocus,
            artifacts: artifacts.map((artifact) => ({
              id: artifact.id,
              label: artifact.label,
              title: artifact.title,
              iteration: artifact.iteration,
            })),
          }}
          reviewClosed={
            normStatus(rawStatus) === 'complete' || compareDirectionApproved
          }
          resubmitMode={!feedbackDrawerIsNew}
          existingFeedbackId={feedbackDrawerExistingFeedbackId}
          clearChangeRequests={
            !feedbackDrawerIsNew && normalizedReviewType === 'approve'
          }
          initialChangeRequests={feedbackDrawerInitialChangeRequests}
          existingFeedbackDraft={
            feedbackDrawerIsNew
              ? null
              : (feedbackDrawerDraftOverride ?? currentUserFeedbackDraft)
          }
          deferRevalidate
          onChangeRequestCreated={handleChangeRequestCreatedWhileDrawer}
          currentContributorId={currentContributorId}
          isReviewCreator={isReviewCreator}
          defaultOnBehalfOf={feedbackDrawerTargetReviewerId}
          assignedReviewers={assignedReviewers.map((reviewer) => ({
            id: reviewer.id,
            name: reviewer.name,
            hasSubmitted: resolvedFeedbackEntries.some(
              (entry) => entry.reviewerId === reviewer.id && entry.status === 'submitted',
            ),
          }))}
          onClose={() => {
            setShowFeedbackDrawer(false);
            setFeedbackDrawerDraftOverride(null);
            setFeedbackDrawerExistingFeedbackId(null);
            setFeedbackDrawerInitialChangeRequests([]);
            setFeedbackDrawerTargetReviewerId(null);
            flushPendingRevalidation();
          }}
          onSubmitSuccess={() => {
            setShowFeedbackDrawer(false);
            setFeedbackDrawerDraftOverride(null);
            setFeedbackDrawerExistingFeedbackId(null);
            setFeedbackDrawerInitialChangeRequests([]);
            setFeedbackDrawerTargetReviewerId(null);
            pendingRevalidation.current = false;
            setFeedbackSavedAlertVisible(true);
            window.setTimeout(() => {
              setFeedbackSavedAlertVisible(false);
            }, 3000);
            router.refresh();
            bumpActivityLog();
          }}
        />
      )}
      {showFinalDecisionDrawer &&
      normalizedReviewType !== 'approve' &&
      (normalizedReviewType !== 'compare' || isDecisionMaker) ? (
        <FinalDecisionDrawer
          open={showFinalDecisionDrawer}
          onClose={() => {
            setShowFinalDecisionDrawer(false);
            setFinalDecisionChangeDirection(false);
          }}
          changeDirection={finalDecisionChangeDirection}
          initialComments={decisionData.text ?? ''}
          initialSelectedIds={decisionData.selectedArtifactIds ?? []}
          initialChangeRequests={finalDecisionChangeRequests.map((row) => ({
            artifactIds: row.artifactIds,
            changesNeeded: row.changesNeeded,
          }))}
          reviewId={reviewId}
          reviewType={
            normalizedReviewType === 'approve' ||
            normalizedReviewType === 'compare' ||
            normalizedReviewType === 'align' ||
            normalizedReviewType === 'critique'
              ? normalizedReviewType
              : 'align'
          }
          reviewFocus={reviewFocus}
          artifacts={artifacts.map((artifact) => ({
            id: artifact.id,
            title: artifact.label ?? artifact.title,
            iterationLabel: artifact.iteration,
          }))}
          currentContributorId={currentContributorId}
          onDecisionSubmitted={() => {
            router.refresh();
            bumpActivityLog();
          }}
        />
      ) : null}
      {feedbackSavedAlertVisible ? (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 1200,
            maxWidth: 360,
          }}
        >
          <Alert
            sentiment="success"
            prominence="low"
            title="Feedback saved"
            dismissible={false}
          />
        </div>
      ) : null}
      {reviewDetailsSaveErrorToast ? (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: feedbackSavedAlertVisible ? 88 : 24,
            background: '#fceaea',
            border: '1px solid #e07070',
            color: '#8a1f1f',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            zIndex: 1200,
          }}
          role="status"
          aria-live="polite"
        >
          {reviewDetailsSaveErrorToast}
        </div>
      ) : null}

      {lifecycleToast ? (
        <FixedToastPortal
          message={lifecycleToast}
          placement="bottom-right"
          onDone={() => setLifecycleToast(null)}
        />
      ) : null}

      {showEditTypeModal ? (
        <EditReviewTypeModal
          reviewId={reviewId}
          currentType={reviewType}
          onClose={() => setShowEditTypeModal(false)}
          onUpdated={() => {
            void logTimelineEventClient({
              projectId,
              reviewId,
              actorId: currentContributorId,
              eventType: 'review_focus_edited',
              payload: {
                review_title: title,
                tooltip_text: 'Review Details',
              },
            });
            showToast('Changes saved');
          }}
        />
      ) : null}

      <EditReviewDrawer
        open={editReviewDrawerOpen}
        onClose={() => setEditReviewDrawerOpen(false)}
        reviewId={reviewId}
        projectId={projectId}
        initialTitle={title}
        initialStatus={displayRawStatus}
        initialReviewFocus={reviewFocus}
        initialReviewType={reviewType}
        initialArtifacts={artifacts}
        reviewStage={overviewStage}
        submittedFeedbackCount={submittedFeedbackCount}
        reviewerContributorIds={assignedReviewers.map((reviewer) => reviewer.id)}
        artifactIdsWithFeedback={artifactIdsWithFeedback}
        onSaved={() => {
          setActivityRefreshKey((key) => key + 1);
          queueMicrotask(() => {
            router.refresh();
          });
        }}
      />

      <Modal
        open={archiveConfirmOpen}
        type="default"
        size="sm"
        title="Archive this review?"
        showSubtitle={false}
        onClose={() => setArchiveConfirmOpen(false)}
        footer={
          <>
            <div className={modalStyles.spacer} />
            <button
              type="button"
              className={modalStyles.btnSecondary}
              onClick={() => setArchiveConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={modalStyles.btnDestructive}
              onClick={() => {
                void (async () => {
                  await archiveReviewStubAction({ reviewId });
                  setArchiveConfirmOpen(false);
                })();
              }}
            >
              Archive
            </button>
          </>
        }
      >
        <p className={modalStyles.description}>
          It will be hidden from the project but not deleted.
        </p>
      </Modal>

      <Modal
        open={removeReviewerModalOpen}
        type="default"
        size="sm"
        title="Remove this reviewer?"
        showSubtitle={false}
        onClose={() => {
          if (removeReviewerSubmitting) return;
          setRemoveReviewerModalOpen(false);
          setPendingReviewerRemoval(null);
        }}
        footer={
          <>
            <div className={modalStyles.spacer} />
            <Button
              variant="secondary"
              size="sm"
              label="Cancel"
              disabled={removeReviewerSubmitting}
              onClick={() => {
                if (removeReviewerSubmitting) return;
                setRemoveReviewerModalOpen(false);
                setPendingReviewerRemoval(null);
              }}
            />
            <Button
              variant="destructive"
              size="sm"
              label={removeReviewerSubmitting ? 'Removing…' : 'Remove reviewer'}
              disabled={removeReviewerSubmitting || !pendingReviewerRemoval}
              onClick={() => {
                if (!pendingReviewerRemoval || removeReviewerSubmitting) return;
                void (async () => {
                  await removeReviewerNow(pendingReviewerRemoval.id);
                  setRemoveReviewerModalOpen(false);
                  setPendingReviewerRemoval(null);
                })();
              }}
            />
          </>
        }
      >
        <p className={modalStyles.description}>
          {pendingReviewerRemoval?.autoCloseOnRemoval
            ? `Removing ${pendingReviewerRemoval.name} will close this review. All remaining reviewers have already approved, so the review will return to Approved.`
            : `Removing ${pendingReviewerRemoval?.name ?? 'this reviewer'} means their feedback won't be included in this review.`}
        </p>
      </Modal>

      <Modal
        open={reopenReviewModalOpen}
        type="default"
        size="sm"
        title="Re-open this review?"
        showSubtitle={false}
        onClose={() => {
          if (reopenReviewSubmitting) return;
          setReopenReviewModalOpen(false);
          resetPendingReviewerAddState();
        }}
        footer={
          <>
            <div className={modalStyles.spacer} />
            <Button
              variant="secondary"
              size="sm"
              label="Cancel"
              disabled={reopenReviewSubmitting}
              onClick={() => {
                if (reopenReviewSubmitting) return;
                setReopenReviewModalOpen(false);
                resetPendingReviewerAddState();
              }}
            />
            <Button
              variant="accent"
              size="sm"
              label={reopenReviewSubmitting ? 'Re-opening' : 'Re-open review'}
              disabled={reopenReviewSubmitting || !pendingReviewerAddSource}
              onClick={() => {
                if (!pendingReviewerAddSource || !pendingReviewerAddConfirmRef.current) return;
                void pendingReviewerAddConfirmRef.current();
              }}
            />
          </>
        }
      >
        <p className={modalStyles.description}>
          {`You're adding ${pendingReviewerNameLabel} to a review that has already received feedback. This will re-open the review so ${pendingReviewerNameLabel} can submit their feedback.`}
        </p>
      </Modal>

      <Modal
        open={showPublishFromBellModal}
        type="default"
        size="sm"
        title="Publish this review?"
        showSubtitle={false}
        backdropClosable={!publishingReview}
        onClose={() => {
          if (publishingReview) return;
          setShowPublishFromBellModal(false);
        }}
        footer={
          <>
            <div className={modalStyles.spacer} />
            <Button
              variant="secondary"
              size="sm"
              label="Cancel"
              disabled={publishingReview}
              onClick={() => setShowPublishFromBellModal(false)}
            />
            <Button
              variant="accent"
              size="sm"
              label={publishingReview ? 'Publishing…' : 'Publish & Notify'}
              disabled={publishingReview}
              onClick={() => {
                void handlePublishFromBell();
              }}
            />
          </>
        }
      >
        <p className={modalStyles.description}>
          This review is still a draft. Publishing it will notify all reviewers and move
          it to In Review.
        </p>
      </Modal>

      {showCompleteModal && typeof document !== 'undefined'
        ? createPortal(
            <Modal
              open={showCompleteModal}
              type="default"
              size="sm"
              title="Mark as complete?"
              description="This will close the review. You can reopen it later from the review page."
              confirmLabel="Mark as complete"
              backdropClosable={!markingComplete}
              onClose={() => {
                if (markingComplete) return;
                setShowCompleteModal(false);
              }}
              onConfirm={() => {
                void handleMarkCompleteConfirm();
              }}
            />,
            document.body,
          )
        : null}

      {showReopenModal && typeof document !== 'undefined'
        ? createPortal(
            <Modal
              open={showReopenModal}
              type="default"
              size="sm"
              title="Reopen this review?"
              showSubtitle={false}
              backdropClosable={!reopenKebabSubmitting}
              onClose={() => {
                if (reopenKebabSubmitting) return;
                setShowReopenModal(false);
                setNotifyOnReopen(true);
              }}
              footer={
                <>
                  <div className={modalStyles.spacer} />
                  <Button
                    variant="secondary"
                    size="sm"
                    label="Cancel"
                    disabled={reopenKebabSubmitting}
                    onClick={() => {
                      if (reopenKebabSubmitting) return;
                      setShowReopenModal(false);
                      setNotifyOnReopen(true);
                    }}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    label={reopenKebabSubmitting ? 'Reopening…' : 'Reopen'}
                    disabled={reopenKebabSubmitting}
                    onClick={() => {
                      void handleReopenKebabConfirm();
                    }}
                  />
                </>
              }
            >
              <p className={modalStyles.description}>
                This will move the review back to In Review.
              </p>
              <div style={{ marginTop: 16 }}>
                <Checkbox
                  id="notify-reviewers-on-reopen"
                  label="Notify reviewers that this review is active again"
                  checked={notifyOnReopen}
                  onChange={setNotifyOnReopen}
                  disabled={reopenKebabSubmitting}
                />
              </div>
            </Modal>,
            document.body,
          )
        : null}

      {showDeleteModal && typeof document !== 'undefined'
        ? createPortal(
            <Modal
              open={showDeleteModal}
              type="default"
              size="sm"
              title="Delete this review?"
              showSubtitle={false}
              backdropClosable={!deletingReview}
              onClose={() => {
                if (deletingReview) return;
                setShowDeleteModal(false);
              }}
              footer={
                <>
                  <div className={modalStyles.spacer} />
                  <Button
                    variant="secondary"
                    size="sm"
                    label="Cancel"
                    disabled={deletingReview}
                    onClick={() => setShowDeleteModal(false)}
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    label={deletingReview ? 'Deleting…' : 'Delete review'}
                    disabled={deletingReview}
                    onClick={() => {
                      void handleDeleteReviewConfirm();
                    }}
                  />
                </>
              }
            >
              <p className={modalStyles.description}>
                This can&apos;t be undone. The review and all its artifacts will be permanently
                deleted.
              </p>
            </Modal>,
            document.body,
          )
        : null}

      {/*  Create-problem modal  */}
      <Modal
        open={problemModalOpen}
        type="form"
        size="md"
        title={editingProblem ? 'Edit the problem' : 'Create a new problem'}
        onClose={closeProblemModal}
        footer={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Checkbox
                id="include-problem-in-project"
                label="Include problem within project details"
                checked={includeInProject}
                onChange={setIncludeInProject}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              label="Cancel"
              onClick={closeProblemModal}
            />
            {(editingProblem ? editText.trim() : newProblemText.trim()) ? (
              <Button
                variant={editingProblem ? 'primary' : 'accent'}
                size="sm"
                label={editingProblem ? 'Save' : 'Create'}
                onClick={async () => {
                  const text = (editingProblem ? editText : newProblemText).trim();
                  if (!text) return;
                  if (editingProblem) {
                    const nextProblems = problems.map((problem) =>
                        problem.id === editingProblem.id ? { ...problem, text } : problem
                    );
                    setProblems(nextProblems);
                    if (includeInProject) {
                      setAllProjectProblems((prev) =>
                        prev.some((problem) => problem.id === editingProblem.id)
                          ? prev.map((problem) =>
                              problem.id === editingProblem.id ? { ...problem, text } : problem
                            )
                          : [...prev, { ...editingProblem, text }]
                      );
                      await supabase
                        .from('problems')
                        .update({ description: text })
                        .eq('id', editingProblem.id);
                    }
                    await persistRelatedProblemIds(nextProblems);
                    await logTimelineEventClient({
                      projectId,
                      reviewId,
                      actorId: currentContributorId,
                      eventType: 'problem_edited',
                      payload: {
                        review_title: title,
                        problem_text: text,
                        tooltip_text: text,
                      },
                    });
                  } else {
                    const next: Problem = {
                      id: crypto.randomUUID(),
                      text,
                      selected: true,
                    };
                    const nextProblems = [...problems, next];
                    setProblems(nextProblems);
                    if (includeInProject) {
                      setAllProjectProblems((prev) => [...prev, next]);
                        await supabase.from('problems').insert({
                          id: next.id,
                          project_id: projectId,
                          description: next.text,
                        });
                      } else {
                        await supabase.from('problems').insert({
                          id: next.id,
                          project_id: projectId,
                          review_id: reviewId,
                          description: next.text,
                        });
                      }
                    await persistRelatedProblemIds(nextProblems);
                    await logTimelineEventClient({
                      projectId,
                      reviewId,
                      actorId: currentContributorId,
                      eventType: 'problem_added',
                      payload: {
                        review_title: title,
                        problem_text: text,
                        tooltip_text: text,
                      },
                    });
                  }
                  showToast('Changes saved');
                  router.refresh();
                  closeProblemModal();
                }}
              />
            ) : (
              <Tooltip label="Add a description to continue">
                <span style={{ display: 'inline-flex' }}>
                  <Button
                    variant={editingProblem ? 'primary' : 'accent'}
                    size="sm"
                    label={editingProblem ? 'Save' : 'Create'}
                    disabled
                    aria-disabled
                  />
                </span>
              </Tooltip>
            )}
          </div>
        }
      >
        <Textarea
          label="Describe the problem or assumption that has been identified"
          showLabel
          size="md"
          variant="form-fixed"
          placeholder="Who feels what, about what, and faces what obstacle?"
          value={editingProblem ? editText : newProblemText}
          onChange={(e) =>
            editingProblem ? setEditText(e.target.value) : setNewProblemText(e.target.value)
          }
        />
      </Modal>

      {/*  Create-tradeoff modal  */}
      <Modal
        open={tradeoffModalOpen}
        type="form"
        size="md"
        title={editingTradeoff ? 'Edit the tradeoff' : 'Create a tradeoff'}
        onClose={closeTradeoffModal}
        footer={
          <>
            <div style={{ flex: 1, minWidth: 0 }} />
            <Button
              variant="secondary"
              size="sm"
              label="Cancel"
              onClick={closeTradeoffModal}
            />
            {newTradeoffText.trim() ? (
              <Button
                variant={editingTradeoff ? 'primary' : 'accent'}
                size="sm"
                label={editingTradeoff ? 'Save' : 'Create'}
                onClick={async () => {
                  const text = newTradeoffText.trim();
                  if (!text) return;
                  const nextTradeoff: Tradeoff = {
                    id: editingTradeoff?.id ?? crypto.randomUUID(),
                    label: text,
                    severity: newTradeoffSeverity,
                    relatedArtifactIds: [...tradeoffSelectedArtifactIds],
                    createdByContributorId:
                      editingTradeoff?.createdByContributorId ?? currentContributorId,
                  };
                  const nextTradeoffs = editingTradeoff
                    ? tradeoffs.map((tradeoff) =>
                        tradeoff.id === editingTradeoff.id ? nextTradeoff : tradeoff,
                      )
                    : [...tradeoffs, nextTradeoff];
                  setTradeoffs(nextTradeoffs);
                  await persistTradeoffsAndLog(nextTradeoffs, {
                    type: editingTradeoff ? 'tradeoff_edited' : 'tradeoff_added',
                    tooltipText: text,
                    severity: newTradeoffSeverity,
                  });
                  closeTradeoffModal();
                }}
              />
            ) : (
              <Tooltip label="Add a description to continue">
                <span style={{ display: 'inline-flex' }}>
                  <Button
                    variant={editingTradeoff ? 'primary' : 'accent'}
                    size="sm"
                    label={editingTradeoff ? 'Save' : 'Create'}
                    disabled
                    aria-disabled
                  />
                </span>
              </Tooltip>
            )}
          </>
        }
      >
        <Textarea
          label="What tradeoff exists?"
          showLabel
          size="md"
          variant="form-fixed"
          placeholder="e.g. Redesigns balance aesthetics and functionality, ensuring user-friendly navigation."
          value={newTradeoffText}
          onChange={(e) => setNewTradeoffText(e.target.value)}
        />
        <Select
          label="Select Risk Level"
          size="sm"
          portaled
          options={[
            { value: 'High', label: 'High' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Low', label: 'Low' },
          ]}
          value={newTradeoffSeverity}
          onChange={(v) =>
            setNewTradeoffSeverity(v as 'High' | 'Medium' | 'Low')
          }
        />
        {artifacts.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 8,
            }}
          >
            <Select
              label="Related Artifacts"
              size="sm"
              portaled
              searchable={false}
              creatable={false}
              placeholder="Select artifacts"
              options={artifacts
                .filter((a) => !tradeoffSelectedArtifactIds.includes(a.id))
                .map((a) => ({
                  value: a.id,
                  label:
                    (a.label ?? a.title ?? a.originalFileName ?? '').trim() ||
                    'Artifact',
                }))}
              value={tradeoffArtifactPickerValue}
              onChange={(v) => {
                setTradeoffSelectedArtifactIds((prev) =>
                  prev.includes(v) ? prev : [...prev, v],
                );
                setTradeoffArtifactPickerValue('');
              }}
            />
            {tradeoffSelectedArtifactIds.length > 0 ? (
              <div className="mt-2 flex flex-col gap-2">
                {tradeoffSelectedArtifactIds.map((artifactId) => {
                  const art = artifacts.find((a) => a.id === artifactId);
                  const title =
                    (art?.label ?? art?.title ?? art?.originalFileName ?? '')
                      .trim() || 'Artifact';
                  return (
                    <div
                      key={artifactId}
                      className="flex h-8 w-full items-center justify-between rounded-[4px] border border-[#e4ddd3] bg-[#f3efe9] px-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#2e1c1c]">
                        {title}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${title}`}
                        onClick={() =>
                          setTradeoffSelectedArtifactIds((prev) =>
                            prev.filter((id) => id !== artifactId),
                          )
                        }
                        className="shrink-0 border-0 bg-transparent p-0 text-[14px] leading-none text-[#998c82] cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/*  Create-teammate modal  */}
      <Modal
        open={reviewerModalOpen}
        type="form"
        size="md"
        title="Create a new teammate"
        onClose={closeReviewerModal}
        footer={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Checkbox
                id="include-teammate-in-team"
                label="Include person within the project team"
                checked={includeInTeam}
                onChange={setIncludeInTeam}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              label="Cancel"
              onClick={closeReviewerModal}
            />
            <Button
              variant="accent"
              size="sm"
              label={isCreatingTeammate ? 'Creating…' : 'Create'}
              disabled={
                !newReviewerName.trim() ||
                Boolean(reviewerEmailExistsError) ||
                isCreatingTeammate
              }
              onClick={async () => {
                const name = newReviewerName.trim();
                const email = newReviewerEmail.trim();
                if (!name || reviewerEmailExistsError || isCreatingTeammate) return;
                if (shouldReopenOnReviewerAdd) {
                  setPendingReviewerAddIds([]);
                  setPendingReviewerAddSource('create-teammate');
                  setPendingReviewerAddLabel(name);
                  setPendingReviewerAddCount(1);
                  pendingReviewerAddConfirmRef.current = async () => {
                    await handleCreateReviewer({
                      name,
                      email,
                      role: newReviewerRole,
                      includeInTeam,
                      reopenReview: true,
                    });
                  };
                  setReopenReviewModalOpen(true);
                  return;
                }
                await handleCreateReviewer({
                  name,
                  email,
                  role: newReviewerRole,
                  includeInTeam,
                  reopenReview: false,
                });
              }}
            />
          </div>
        }
      >
        <Input
          label="Name"
          size="sm"
          placeholder="Full name"
          value={newReviewerName}
          onChange={(e) => setNewReviewerName(e.target.value)}
        />
        <Input
          label="Email Address"
          size="sm"
          type="email"
          placeholder="email@example.com"
          value={newReviewerEmail}
          onChange={(e) => setNewReviewerEmail(e.target.value)}
          error={Boolean(reviewerEmailExistsError)}
          errorMessage={reviewerEmailExistsError ?? undefined}
        />
        <Select
          label="Role"
          size="sm"
          placeholder="Select"
          options={[
            { value: 'Designer', label: 'Designer' },
            { value: 'Product Manager', label: 'Product Manager' },
            { value: 'Engineer', label: 'Engineer' },
            { value: 'Stakeholder', label: 'Stakeholder' },
          ]}
          value={newReviewerRole || undefined}
          onChange={(v) => setNewReviewerRole(v)}
        />
      </Modal>
    </div>
  );
}

//  Section heading 

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 20,
        fontWeight: 700,
        color: COLOURS.textHeading,
        letterSpacing: '-0.3px',
        margin: 0,
      }}
    >
      {children}
    </h2>
  );
}

function FilterChip({
  prefix,
  label,
  onRemove,
}: {
  prefix: 'Tags' | 'People';
  label: string;
  onRemove: () => void;
}) {
  return (
    <span
      style={{
        background: '#ede8e0',
        border: '1px solid #c9c0b4',
        borderRadius: 4,
        padding: '4px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: '#6b5e55' }}>{`${prefix}:`}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: '#6b5e55' }}>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${prefix} ${label} filter`}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#6b5e55',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <Icon name="close" size={14} />
      </button>
    </span>
  );
}

//  Problem row 
//
// Every rendered problem is linked to this review. The row is neutral by
// default; in edit mode it picks up the brand-pink treatment on hover and
// surfaces a trailing close button that removes (deselects) the problem from
// the list. View-only never hovers and never shows the close button.

function ProblemRow({
  problem,
  mode,
  open,
  onToggleMenu,
  onCloseMenu,
  onEdit,
  onDelete,
  menuRef,
}: {
  problem: Problem;
  mode: ReviewMode;
  open: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onEdit: () => void;
  onDelete: () => void;
  menuRef: (node: HTMLDivElement | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const kebabRef = useRef<HTMLDivElement | null>(null);
  const isEdit = mode === 'edit';
  const showBrand = isEdit && hovered;

  useEffect(() => {
    menuRef(kebabRef.current);
    return () => menuRef(null);
  }, [menuRef]);

  return (
    <div
      className="flex items-center w-full"
      onMouseEnter={() => isEdit && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 42,
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: 4,
        paddingBottom: 4,
        borderRadius: 4,
        backgroundColor: showBrand ? '#f5eaec' : '#f3efe9',
        border: `1px solid ${showBrand ? '#e8d0d4' : '#e4ddd3'}`,
        transition: 'background-color 120ms ease, border-color 120ms ease',
        cursor: 'default',
      }}
    >
      <Tooltip
        label={problem.text}
        position="top"
        maxWidth={320}
        fullWidth
        className="flex-1 min-w-0"
      >
        <span
          className="block w-full truncate text-left"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: showBrand ? '#6b1e2e' : '#6b5e55',
            letterSpacing: '0.13px',
            lineHeight: 1.5,
            transition: 'color 120ms ease',
          }}
        >
          {problem.text}
        </span>
      </Tooltip>

      {showBrand && isEdit && (
        <div ref={kebabRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label="More options"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: '#6b1e2e',
              padding: 0,
            }}
          >
            <Icon name="kebab" size={14} />
          </button>
          <Menu
            open={open}
            onClose={onCloseMenu}
            anchorRef={kebabRef}
            align="right"
          >
            <MenuItem label="Edit" onClick={onEdit} />
            <MenuItem label="Delete" onClick={onDelete} />
          </Menu>
        </div>
      )}
    </div>
  );
}

//  Reviewer chip 

function ReviewerChip({
  reviewer,
  mode,
  reviewType,
  removable = true,
  onRemove,
}: {
  reviewer: Reviewer;
  mode: ReviewMode;
  reviewType: string;
  removable?: boolean;
  onRemove: () => void | Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  const isLilac = reviewer.variant === 'lilac';
  const isEdit = mode === 'edit';
  const isHovered = hovered;
  const removeDisabled = isEdit && !removable;
  const normalizedReviewType = reviewType.trim().toLowerCase();
  const isCompareReview =
    normalizedReviewType === 'compare' || normalizedReviewType === 'comparison';
  const isDecisionMakerTag = isCompareReview && reviewer.isDecisionMaker;

  const showBrandHover = isEdit && isHovered;
  const bg = showBrandHover
    ? isLilac
      ? '#f0e2f1'
      : '#f5eaec'
    : isLilac
      ? '#f5e8f6'
      : '#f3efe9';
  const borderCol = showBrandHover
    ? isLilac
      ? '#c490c8'
      : '#e8d0d4'
    : isLilac
      ? '#d9a8dc'
      : '#e4ddd3';

  const tooltipLabel = (() => {
    if (isDecisionMakerTag) {
      if (removeDisabled) {
        return "Can't remove — feedback already submitted. This reviewer is the Decision Maker.";
      }
      return 'Decision Maker — removes direction authority if removed.';
    }
    if (removeDisabled) {
      return "Can't remove — feedback already submitted.";
    }
    return null;
  })();

  const colourKey = avatarColourKey(reviewer.email, reviewer.id);

  const chip = (
    <span
      className="group inline-flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 32,
        backgroundColor: bg,
        border: `1px solid ${borderCol}`,
        borderRadius: 4,
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 4,
        paddingBottom: 4,
        gap: 8,
        transition: 'background-color 120ms ease, border-color 120ms ease',
      }}
    >
      <Avatar
        name={reviewer.name}
        contributorId={reviewer.id}
        size="md"
        prominence="high"
        style={avatarInlinePaletteStyle(reviewer.email, reviewer.id, true)}
      />
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: '#6b5e55',
          whiteSpace: 'nowrap',
        }}
      >
        {reviewer.name}
      </span>
      {reviewer.role.trim() ? (
        <span
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: '#998c82',
            lineHeight: 1.65,
            whiteSpace: 'nowrap',
          }}
        >
          {reviewer.role}
        </span>
      ) : null}

      {isEdit && (
        <>
          {isLilac && (
            <button
              type="button"
              aria-label={`Info about ${reviewer.name}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: '#998c82',
              }}
            >
              <Icon name="info" size={16} />
            </button>
          )}
          {!removeDisabled ? (
          <span className="inline-flex opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => void onRemove()}
            aria-label={`Remove ${reviewer.name}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: '#998c82',
            }}
          >
            <Icon name="close" size={16} />
          </button>
          </span>
          ) : null}
        </>
      )}
    </span>
  );
  return tooltipLabel ? (
    <Tooltip label={tooltipLabel}>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}

//  Right column (Feedback) 
//
// Feedback column has 4 stages (from Figma):
//   1. No reviewers assigned                       heading, no badge
//   2. Reviewers assigned, awaiting feedback       heading + badge, full-width
//                                                   "Submit Feedback" CTA above list
//   3. All feedback submitted, awaiting decision   heading + badge
//   4. Decision made                               heading + badge, reminder + add
//                                                   disabled, DecisionCard at bottom

type FeedbackStage = 1 | 2 | 3 | 4;

function CompareDecisionPromptCard({
  variant,
  displayName,
  contributorId,
  contributorEmail,
  onAddDecision,
}: {
  variant: 'required' | 'pending';
  displayName: string;
  contributorId?: string | null;
  contributorEmail?: string | null;
  onAddDecision?: () => void;
}) {
  const colourKey = avatarColourKey(contributorEmail, contributorId);
  const statusTooltipLabel =
    variant === 'required'
      ? 'All reviewers have submitted their preferred option. Review the feedback below and use Add Decision to record the final direction.'
      : 'All reviewers have submitted their feedback. The decision maker is reviewing the options and will record the final direction shortly.';

  return (
    <div
      className="-mx-6 w-[calc(100%+3rem)] shrink-0"
      style={{
        background: 'var(--feedback/warning/bg, #fef8dc)',
        borderTop: '1px solid var(--feedback/warning/border, #e5b025)',
        borderBottom: '1px solid var(--feedback/warning/border, #e5b025)',
        boxShadow: '0 2px 8px 0 rgba(107, 30, 46, 0.06)',
      }}
    >
      <div
        className="flex w-full flex-col"
        style={{
          padding: '0 40px 16px',
          gap: variant === 'required' ? 10 : 0,
        }}
      >
      <div className="flex items-center gap-2">
        <Avatar
          name={displayName}
          contributorId={contributorId ?? colourKey}
          size="md"
          style={avatarInlinePaletteStyle(contributorEmail, contributorId, true)}
        />
        <span
          className="min-w-0 flex-1 truncate"
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: '0.2px',
            lineHeight: 1.5,
            color: 'var(--text/primary, #2e1c1c)',
          }}
        >
          {displayName}
        </span>
        <Tooltip label={statusTooltipLabel} position="top">
          <span className="inline-flex shrink-0 items-center gap-1">
            <span
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 12,
                fontWeight: 400,
                lineHeight: 1.5,
                color: '#7a5500',
              }}
            >
              {variant === 'required' ? 'Decision Required' : 'Decision Pending'}
            </span>
            <Icon
              name="status-blocked"
              size={16}
              style={{ color: '#e5b025', flexShrink: 0 }}
            />
          </span>
        </Tooltip>
      </div>
      {variant === 'required' && onAddDecision ? (
        <Button
          variant="primary"
          size="md"
          label="Add Decision"
          icon="leading"
          iconName="nav-decisions"
          className="w-full"
          onClick={onAddDecision}
        />
      ) : null}
      </div>
    </div>
  );
}

function deriveFeedbackStage(
  feedback: FeedbackThread[],
  decisionMade: boolean,
  ctx?: {
    reviewTypeNorm?: string;
    rawReviewStatus?: string;
    changeRequestCount?: number;
  },
): FeedbackStage {
  const rt = (ctx?.reviewTypeNorm ?? '').trim().toLowerCase();
  const isApprove = rt === 'approve' || rt === 'approval';
  if (isApprove) {
    const statusNorm = normStatus(ctx?.rawReviewStatus ?? '');
    if (statusNorm === 'approved') return 4;
    if (feedback.length === 0) return 1;
    const allSubmitted = feedback.every((t) => t.status === 'submitted');
    if (!allSubmitted) return 2;
    const hasChanges =
      (ctx?.changeRequestCount ?? 0) > 0 ||
      statusNorm === 'needs-changes' ||
      statusNorm === 'changes-needed';
    return hasChanges ? 3 : 3;
  }
  if (decisionMade) return 4;
  if (feedback.length === 0) return 1;
  const allSubmitted = feedback.every((t) => t.status === 'submitted');
  if (allSubmitted) return 3;
  return 2;
}

function ChangeRequestArtifactTag({ label }: { label: string }) {
  return (
    <Tooltip label="Changes have been requested." position="top">
      <span className="inline-flex">
        <Tag label={label} variant="brand" size="sm" />
      </span>
    </Tooltip>
  );
}

function ChangeRequestReplyComposer({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
}) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!value.trim()) return;
      onSend();
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <Input
        label="Reply"
        placeholder="Reply..."
        size="sm"
        value={value}
        showHelper={false}
        className="min-w-0 flex-1 [&_label]:sr-only"
        onChange={(e) => onChange(e.target.value.slice(0, 140))}
        onKeyDown={handleKeyDown}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        label="Send"
        disabled={!value.trim()}
        onClick={onSend}
      />
    </div>
  );
}

function RelativeTimeText({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const label = useClientRelativeTime(iso, { short: true });
  if (!label) return null;
  return <span className={className}>{label}</span>;
}

function FeedbackThreadCommentCard({
  thread,
  threadReplies,
  cardCategory,
  reviewType,
  currentContributorId,
  canCurrentUserMakeDecision,
  contributorsById,
  contactDisplayById,
  artifacts,
  reviewOwnerName,
  onFeedbackReply,
  onMakeDecision,
  disableReplies = false,
  userIdByContributorId,
}: {
  thread: FeedbackThread;
  threadReplies: CardReplyRow[];
  cardCategory: 'feedback' | 'notification';
  reviewType: string;
  currentContributorId: string | null;
  canCurrentUserMakeDecision: boolean;
  contributorsById: Map<string, ContributorOption>;
  contactDisplayById: Record<string, string>;
  artifacts: ReviewArtifact[];
  reviewOwnerName: string | null;
  onFeedbackReply: (feedbackId: string, text: string) => Promise<void>;
  onMakeDecision: () => void;
  disableReplies?: boolean;
  userIdByContributorId: Map<string, string>;
}) {
  const timestamp = useClientRelativeTime(thread.submittedAtIso ?? null, {
    short: true,
  });
  const [replyTimestamps, setReplyTimestamps] = useState<Record<string, string>>({});

  useEffect(() => {
    const update = () => {
      const next: Record<string, string> = {};
      for (const reply of threadReplies) {
        const date = new Date(reply.created_at);
        if (!Number.isNaN(date.getTime())) {
          next[reply.id] = formatDistanceToNowShort(date);
        }
      }
      setReplyTimestamps(next);
    };
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [threadReplies]);

  const type = getCommentType(thread, threadReplies.length > 0);
  const conceptOptions = resolveThreadConceptOptions(thread, artifacts);
  const reviewTypeNorm = normStatus(reviewType);
  const isCompareReview =
    reviewTypeNorm === 'compare' || reviewTypeNorm === 'comparison';
  const optionTagVariant =
    isCompareReview && conceptOptions.length > 0 ? 'aqua' : 'brand';
  const replies = threadReplies.map((reply) => {
    const authorName =
      reply.reply_by_name ??
      (reply.reply_by_id
        ? contactDisplayById?.[reply.reply_by_id] ??
          contributorsById?.get(reply.reply_by_id)?.name ??
          'Reviewer'
        : 'Reviewer');
    return {
      text: reply.reply_text,
      authorName,
      authorInitials: initialsFromName(authorName),
      timestamp: replyTimestamps[reply.id] ?? '',
      authorContributorId: reply.reply_by_id ?? undefined,
    };
  });

  return (
    <CommentThread
      type={type}
      cardCategory={cardCategory}
      isStakeholder={
        Boolean(currentContributorId) &&
        canCurrentUserMakeDecision &&
        thread.reviewerId === currentContributorId
      }
      authorName={thread.author}
      authorContributorId={thread.reviewerId}
      authorEmail={thread.authorEmail}
      authorAvatarSrc={thread.authorAvatarSrc}
      timestamp={timestamp || undefined}
      body={thread.text}
      options={conceptOptions}
      optionTagVariant={optionTagVariant}
      replies={replies}
      onReply={
        !disableReplies && thread.status === 'submitted'
          ? (text) => void onFeedbackReply(thread.id, text)
          : undefined
      }
      onMakeDecision={onMakeDecision}
      statusInfoTooltip={
        (thread.status === 'pending' || thread.status === 'decision-required') &&
        thread.requestedAt
          ? (() => {
              const formatted = formatRequestedAtTooltip(thread.requestedAt);
              if (!formatted) return undefined;
              const requester = reviewOwnerName?.trim() || 'Requester';
              return `${requester} requested feedback on ${formatted}`;
            })()
          : undefined
      }
    />
  );
}

function RightColumn({
  open,
  hydrated,
  headerOffset,
  onToggle,
  feedback,
  filteredCards,
  pendingCount,
  mode,
  decision,
  reviewId,
  primaryFeedbackCta,
  artifacts,
  onOpenSubmitFeedbackDrawer,
  onOpenFinalDecisionDrawer,
  onSendReminder,
  sendingReminder,
  isReminderRateLimited,
  reminderLastSentAt,
  canCurrentUserMakeDecision,
  currentContributorId,
  canSubmitFeedback,
  isDecisionMaker,
  showReminderBell,
  allReviewerFeedbackSubmitted,
  reviewOwnerName,
  totalCardCount,
  totalReviewerCount,
  approveFeedbackSubmissionCount,
  approveUniqueReviewerCount,
  changeRequestCount,
  changeRequests,
  approveRhcReviewerEntries,
  reviewersForMenu,
  activeFilters,
  setActiveFilters,
  showFilterMenu,
  setShowFilterMenu,
  onFeedbackReply,
  changeRequestReplies,
  setChangeRequestReplies,
  onChangeRequestReply,
  reviewersById,
  contributorsById,
  contactDisplayById,
  changeRequestLabelById,
  allCardsCount,
  filteredCardsCount,
  hasActiveFilters,
  repliesByCardId,
  reviewType,
  currentUserHasNotSubmitted,
  reviewStatus,
  reviewClosed,
  comparisonDecisionPromptRowName,
  showComparisonButterPromptDm,
  showDecisionPromptReadonly,
  decisionMakerDisplayName,
  decisionMakerContributorId,
  compareReviewFullyLocked,
  compareHideSubmitFeedback,
  assignableContributors,
  userIdByContributorId,
  requireDecisionMaker,
  onAddReviewers,
  isReviewPaused = false,
  isReviewDraft = false,
}: {
  open: boolean;
  hydrated: boolean;
  /** Viewport offset for compact fixed overlay — matches measured PageHeader height. */
  headerOffset: number;
  onToggle: () => void;
  feedback: FeedbackThread[];
  filteredCards: Array<
    | {
        cardType: 'feedback';
        id: string;
        reviewerId: string;
        createdAt: string;
        thread: FeedbackThread;
      }
    | {
        cardType: 'notification';
        id: string;
        reviewerId: string;
        createdAt: string;
        thread: FeedbackThread;
      }
    | {
        cardType: 'change_request';
        id: string;
        reviewerId: string | null;
        createdAt: string;
        changeRequest: ReviewChangeRequestEntry;
      }
  >;
  pendingCount: number;
  mode: ReviewMode;
  decision: DecisionSummary | null;
  reviewId: string;
  primaryFeedbackCta: ReturnType<typeof getPrimaryFeedbackCta>;
  artifacts: ReviewArtifact[];
  onOpenSubmitFeedbackDrawer: (options?: {
    prefill?: boolean;
    feedbackEntryId?: string;
  }) => void;
  onOpenFinalDecisionDrawer: () => void;
  onSendReminder: () => Promise<boolean>;
  sendingReminder: boolean;
  isReminderRateLimited: boolean;
  reminderLastSentAt: string | null;
  canCurrentUserMakeDecision: boolean;
  currentContributorId: string | null;
  canSubmitFeedback: boolean;
  isDecisionMaker: boolean;
  showReminderBell: boolean;
  allReviewerFeedbackSubmitted: boolean;
  reviewOwnerName: string | null;
  totalCardCount: number;
  totalReviewerCount: number;
  approveFeedbackSubmissionCount: number;
  approveUniqueReviewerCount: number;
  changeRequestCount: number;
  changeRequests: ReviewChangeRequestEntry[];
  approveRhcReviewerEntries: ApproveRhcReviewerEntry[];
  reviewersForMenu: MenuSectionsReviewer[];
  activeFilters: MenuSectionsState;
  setActiveFilters: (value: MenuSectionsState) => void;
  showFilterMenu: boolean;
  setShowFilterMenu: (value: boolean) => void;
  onFeedbackReply: (feedbackId: string, text: string) => Promise<void>;
  changeRequestReplies: Record<string, string>;
  setChangeRequestReplies: (
    value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  onChangeRequestReply: (changeRequestId: string) => Promise<void>;
  reviewersById: Map<string, ReviewerAssignment>;
  contributorsById: Map<string, ContributorOption>;
  contactDisplayById: Record<string, string>;
  changeRequestLabelById: Map<string, string>;
  allCardsCount: number;
  filteredCardsCount: number;
  hasActiveFilters: boolean;
  repliesByCardId: Map<string, CardReplyRow[]>;
  reviewType: string;
  currentUserHasNotSubmitted: boolean;
  reviewStatus: string;
  reviewClosed: boolean;
  comparisonDecisionPromptRowName: string | null;
  showComparisonButterPromptDm: boolean;
  showDecisionPromptReadonly: boolean;
  decisionMakerDisplayName: string;
  decisionMakerContributorId: string | null;
  compareReviewFullyLocked: boolean;
  compareHideSubmitFeedback: boolean;
  assignableContributors: Array<{
    id: string;
    name: string;
    role: string;
    email?: string | null;
    userId: string;
    isPending?: boolean;
  }>;
  userIdByContributorId: Map<string, string>;
  requireDecisionMaker: boolean;
  onAddReviewers: (input: {
    reviewerIds: string[];
    source: 'overview' | 'rhc';
    onStartSaving: () => void;
    onFinishSaving: () => void;
    onSuccess: () => void;
  }) => void;
  isReviewPaused?: boolean;
  isReviewDraft?: boolean;
}) {
  const width = open ? RHC_OPEN_WIDTH : RHC_CLOSED_WIDTH;
  const decisionMade = decision !== null;
  const rawRt = reviewType.trim().toLowerCase();
  const normalizedReviewType =
    rawRt === 'comparison'
      ? 'compare'
      : rawRt === 'approval'
        ? 'approve'
        : rawRt === 'alignment'
          ? 'align'
          : rawRt;
  const stage = deriveFeedbackStage(feedback, decisionMade, {
    reviewTypeNorm: normalizedReviewType,
    rawReviewStatus: reviewStatus,
    changeRequestCount,
  });
  const showApproveFeedbackReceived =
    normalizedReviewType === 'approve' && stage >= 3;
  const showApproveStage2ReviewerCards =
    normalizedReviewType === 'approve' && stage === 2;
  const showAlignFeedbackReceived =
    normalizedReviewType === 'align' && stage >= 2;
  const rhcCardsForRender = showAlignFeedbackReceived
    ? filteredCards.filter((card) => card.cardType !== 'change_request')
    : filteredCards;
  const approveFeedbackBadgeTooltip =
    normalizedReviewType === 'approve' && approveFeedbackSubmissionCount > 0
      ? `${approveFeedbackSubmissionCount} feedback submission${
          approveFeedbackSubmissionCount === 1 ? '' : 's'
        } from ${approveUniqueReviewerCount} reviewer${
          approveUniqueReviewerCount === 1 ? '' : 's'
        }`
      : null;
  const [rhcReviewerPopoverOpen, setRhcReviewerPopoverOpen] = useState(false);
  const [rhcSelectedReviewerIds, setRhcSelectedReviewerIds] = useState<string[]>([]);
  const [rhcSavingReviewers, setRhcSavingReviewers] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const rhcScrollRef = useRef<HTMLDivElement | null>(null);
  const rhcAddReviewersAnchorRef = useRef<HTMLDivElement | null>(null);
  const rhcAddReviewersPopoverRef = useRef<HTMLDivElement | null>(null);
  const reminderDisabled =
    pendingCount === 0 ||
    allReviewerFeedbackSubmitted ||
    sendingReminder ||
    reviewClosed ||
    isReminderRateLimited;
  const reminderRelativeTime = useClientRelativeTime(reminderLastSentAt ?? null);
  const reminderTooltipLabel = isReminderRateLimited
    ? `Reminder sent ${reminderRelativeTime || 'just now'}`
    : 'Remind reviewers to submit feedback';
  const reminderTooltipSupporting =
    !isReminderRateLimited && reminderLastSentAt && reminderRelativeTime
      ? `Last reminder sent ${reminderRelativeTime}`
      : undefined;
  const [reminderJustSent, setReminderJustSent] = useState(false);
  const filterAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(RHC_COMPACT_BREAKPOINT);
    const sync = () => setIsCompactViewport(!mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!rhcReviewerPopoverOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (rhcAddReviewersPopoverRef.current?.contains(e.target as Node)) return;
      if (rhcAddReviewersAnchorRef.current?.contains(e.target as Node)) return;
      setRhcReviewerPopoverOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [rhcReviewerPopoverOpen]);

  useEffect(() => {
    if (!reminderJustSent) return;
    const timer = window.setTimeout(() => setReminderJustSent(false), 3000);
    return () => window.clearTimeout(timer);
  }, [reminderJustSent]);
  const filterButtonVariant = hasActiveFilters ? 'primary' : 'secondary';
  const filterButtonStyle: React.CSSProperties | undefined =
    !hasActiveFilters && showFilterMenu
      ? { backgroundColor: '#f5eaec', borderColor: '#e8d0d4' }
      : undefined;
  const headerIconOnlyButtonStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    padding: 0,
    flexShrink: 0,
  };
  const headerIconDimmedStyle: React.CSSProperties = {
    ...headerIconOnlyButtonStyle,
    opacity: reviewClosed ? 0.45 : 1,
  };
  const handleMakeDecision = () => {
    if (normalizedReviewType === 'compare' && !isDecisionMaker) return;
    onOpenFinalDecisionDrawer();
  };
  const hasFiltersRow = hasActiveFilters;
  const hasSubmitFeedbackCta = canSubmitFeedback;
  const hasDecisionCta =
    normalizedReviewType !== 'approve' && primaryFeedbackCta?.type === 'make-decision';
  const submitFeedbackLabel =
    normalizedReviewType === 'approve'
      ? 'Submit Feedback'
      : primaryFeedbackCta?.type === 'submit-feedback'
      ? primaryFeedbackCta.label
      : 'Submit Feedback';
  const currentUserHasSubmittedApproveFeedback = feedback.some(
    (thread) =>
      thread.reviewerId === currentContributorId && thread.status === 'submitted',
  );
  const approvedKeysForCurrentUser = useMemo(() => {
    const thread = feedback.find(
      (item) => item.reviewerId === currentContributorId && item.status === 'submitted',
    );
    return String(thread?.optionTag ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }, [feedback, currentContributorId]);
  const allArtifactsApprovedByCurrentUser =
    artifacts.length > 0 &&
    artifacts.every((artifact) =>
      approvedKeysForCurrentUser.includes(artifactSelectionKey(artifact)),
    );
  const compareCurrentUserSubmitted =
    normalizedReviewType === 'compare' &&
    Boolean(currentContributorId) &&
    feedback.some(
      (thread) =>
        thread.reviewerId === currentContributorId && thread.status === 'submitted',
    );
  const alignCurrentUserSubmitted =
    normalizedReviewType === 'align' &&
    Boolean(currentContributorId) &&
    feedback.some(
      (thread) =>
        thread.reviewerId === currentContributorId && thread.status === 'submitted',
    );
  const hideRhcAddFeedbackBtn =
    (normalizedReviewType === 'approve' && (stage === 1 || stage === 2 || stage >= 3)) ||
    (normalizedReviewType === 'compare' && compareCurrentUserSubmitted) ||
    (normalizedReviewType === 'align' && alignCurrentUserSubmitted);
  const showAddFeedbackBtn = canSubmitFeedback && !hideRhcAddFeedbackBtn;
  const showAlignEditFeedbackBtn =
    normalizedReviewType === 'align' && alignCurrentUserSubmitted;
  const hideApprovePrimarySubmitCta =
    normalizedReviewType === 'approve' &&
    (showApproveFeedbackReceived ||
      (currentUserHasSubmittedApproveFeedback && allArtifactsApprovedByCurrentUser));
  // Compare at feedback-submitted: the butter Decision Required / Decision
  // Pending card is the sole RHC CTA. Remove the Submit Feedback button and the
  // standalone Make Decision button from the DOM entirely.
  const compareDecisionStage =
    normalizedReviewType === 'compare' &&
    normStatus(reviewStatus ?? '') === 'feedback-submitted';
  const effectiveHasSubmitFeedbackCta =
    hasSubmitFeedbackCta &&
    !hideApprovePrimarySubmitCta &&
    !compareDecisionStage &&
    !compareHideSubmitFeedback &&
    !isReviewPaused &&
    !isReviewDraft;
  const effectiveHasDecisionCta =
    hasDecisionCta &&
    !compareDecisionStage &&
    (normalizedReviewType !== 'compare' || isDecisionMaker) &&
    !isReviewPaused;
  const effectiveHasTagsAndCtaGroup =
    hasFiltersRow || effectiveHasSubmitFeedbackCta || effectiveHasDecisionCta;
  const isCompactOverlay = isCompactViewport && open;
  const collapsedBadgeCount =
    normalizedReviewType === 'approve'
      ? approveFeedbackSubmissionCount
      : totalCardCount;
  const showCollapsedBadge = stage !== 1 && collapsedBadgeCount > 0;

  return (
    <aside
      className="flex shrink-0 min-h-0 flex-col h-full overflow-hidden"
      style={{
        width,
        minWidth: open ? 360 : RHC_CLOSED_WIDTH,
        maxWidth: open ? 440 : RHC_CLOSED_WIDTH,
        backgroundColor: COLOURS.surfaceCard,
        borderLeft: `1px solid ${COLOURS.borderDefault}`,
        transition: hydrated ? 'width 200ms ease-in-out' : 'none',
        ...(isCompactOverlay
          ? {
              position: 'fixed',
              right: 0,
              top: headerOffset,
              bottom: 0,
              zIndex: 50,
              height: 'auto',
              boxShadow: '0 0 24px rgba(41, 33, 28, 0.12)',
            }
          : {}),
      }}
      aria-label="Feedback"
      data-review-id={reviewId}
      data-feedback-stage={stage}
    >
      {open ? (
        <div className="flex h-full min-h-0 flex-col">
          <div
            className="shrink-0 px-6 pt-8"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: COLOURS.surfaceCard,
              paddingBottom: 24,
            }}
          >
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <h2
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: COLOURS.textHeading,
                      margin: 0,
                    }}
                  >
                    Feedback
                  </h2>
                  {stage !== 1 &&
                    (normalizedReviewType === 'approve'
                      ? approveFeedbackSubmissionCount > 0
                      : totalCardCount > 0) &&
                    (hasActiveFilters && normalizedReviewType !== 'approve' ? (
                      <span
                        className={`${notificationBadgeStyles.badge} ${notificationBadgeStyles['badge-brand']}`}
                        role="status"
                        aria-label={`${filteredCardsCount} of ${allCardsCount} cards shown`}
                        style={{ textTransform: 'none', letterSpacing: '0.02em' }}
                      >
                        {`${filteredCardsCount} of ${allCardsCount}`}
                      </span>
                    ) : normalizedReviewType === 'approve' ? (
                      <Tooltip
                        label={approveFeedbackBadgeTooltip ?? ''}
                        position="bottom"
                      >
                        <span className="inline-flex">
                          <NotificationBadge
                            variant="number"
                            sentiment="brand"
                            count={approveFeedbackSubmissionCount}
                          />
                        </span>
                      </Tooltip>
                    ) : (
                      <NotificationBadge
                        variant="number"
                        sentiment="brand"
                        count={totalCardCount}
                      />
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  {showReminderBell && (
                    <Tooltip
                      label={reminderTooltipLabel}
                      supportingText={reminderTooltipSupporting}
                      position="bottom"
                    >
                      <span style={{ display: 'inline-flex' }}>
                        <Button
                          type="button"
                          label="Feedback notifications"
                          aria-label="Feedback notifications"
                          variant="secondary"
                          size="sm"
                          icon="leading"
                          iconOnly
                          iconName="notification"
                          style={{
                            ...headerIconDimmedStyle,
                            opacity: sendingReminder ? 0.5 : headerIconDimmedStyle.opacity,
                          }}
                          disabled={reminderDisabled}
                          onClick={() => {
                            void (async () => {
                              const ok = await onSendReminder();
                              if (ok) setReminderJustSent(true);
                            })();
                          }}
                        />
                      </span>
                    </Tooltip>
                  )}
                  {showAddFeedbackBtn ? (
                    <Tooltip
                      label={
                        reviewClosed
                          ? 'This review has been closed'
                          : 'Add additional feedback'
                      }
                      position="bottom"
                    >
                      <span style={{ display: 'inline-flex' }}>
                        <Button
                          type="button"
                          label="Add feedback"
                          aria-label="Add feedback"
                          variant="secondary"
                          size="sm"
                          icon="leading"
                          iconOnly
                          iconName="plus"
                          style={headerIconDimmedStyle}
                          disabled={reviewClosed}
                          onClick={
                            reviewClosed ? undefined : () => onOpenSubmitFeedbackDrawer()
                          }
                        />
                      </span>
                    </Tooltip>
                  ) : null}
                  {showAlignEditFeedbackBtn ? (
                    <Tooltip
                      label={
                        reviewClosed
                          ? 'This review has been closed'
                          : 'Edit your feedback'
                      }
                      position="bottom"
                    >
                      <span style={{ display: 'inline-flex' }}>
                        <Button
                          type="button"
                          label="Edit feedback"
                          aria-label="Edit feedback"
                          variant="secondary"
                          size="sm"
                          icon="leading"
                          iconOnly
                          iconName="edit"
                          style={headerIconDimmedStyle}
                          disabled={reviewClosed}
                          onClick={
                            reviewClosed
                              ? undefined
                              : () => {
                                  const entry = feedback.find(
                                    (thread) =>
                                      thread.reviewerId === currentContributorId &&
                                      thread.status === 'submitted',
                                  );
                                  if (!entry) return;
                                  onOpenSubmitFeedbackDrawer({
                                    prefill: true,
                                    feedbackEntryId: entry.id,
                                  });
                                }
                          }
                        />
                      </span>
                    </Tooltip>
                  ) : null}
                  {stage !== 1 ? (
                  <div
                    ref={filterAnchorRef}
                    style={{ position: 'relative', display: 'inline-flex' }}
                  >
                    <Button
                      type="button"
                      label="Filter feedback cards"
                      aria-label="Filter feedback cards"
                      variant={filterButtonVariant}
                      size="sm"
                      icon="leading"
                      iconOnly
                      iconName="filter"
                      style={{
                        ...headerIconOnlyButtonStyle,
                        ...filterButtonStyle,
                      }}
                      aria-expanded={showFilterMenu}
                      aria-haspopup="menu"
                      onClick={() => setShowFilterMenu(!showFilterMenu)}
                    />
                    {showFilterMenu ? (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '100%',
                          marginTop: 4,
                          zIndex: 50,
                        }}
                      >
                        <div style={{ position: 'relative' }}>
                          <Menu
                            open={showFilterMenu}
                            onClose={() => setShowFilterMenu(false)}
                            type="sections"
                            anchorRef={filterAnchorRef}
                            sections={activeFilters}
                            reviewers={reviewersForMenu}
                            className="left-auto right-0"
                            onApply={(filters) => {
                              setActiveFilters(filters);
                              setShowFilterMenu(false);
                            }}
                          >
                            {null}
                          </Menu>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  ) : null}
                  <Button
                    type="button"
                    label="Collapse feedback panel"
                    aria-label="Collapse feedback panel"
                    variant="secondary"
                    size="sm"
                    icon="leading"
                    iconOnly
                    iconName="close-drawer"
                    style={headerIconOnlyButtonStyle}
                    onClick={onToggle}
                  />
                </div>
              </div>
                </div>
              </div>

          <div
            ref={rhcScrollRef}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6"
          >
            {((showComparisonButterPromptDm && !isReviewPaused) || showDecisionPromptReadonly) ? (
              <div
                className="sticky z-10 shrink-0"
                style={{
                  top: 0,
                  background: COLOURS.surfaceCard,
                }}
              >
                {showComparisonButterPromptDm && !isReviewPaused ? (
                  <CompareDecisionPromptCard
                    variant="required"
                    displayName={
                      comparisonDecisionPromptRowName ?? decisionMakerDisplayName
                    }
                    contributorId={decisionMakerContributorId ?? currentContributorId}
                    contributorEmail={contributorEmailById(
                      decisionMakerContributorId ?? currentContributorId,
                      contributorsById,
                      reviewersById,
                    )}
                    onAddDecision={
                      isDecisionMaker ? onOpenFinalDecisionDrawer : undefined
                    }
                  />
                ) : null}
                {showDecisionPromptReadonly ? (
                  <CompareDecisionPromptCard
                    variant="pending"
                    displayName={decisionMakerDisplayName}
                    contributorId={decisionMakerContributorId}
                    contributorEmail={contributorEmailById(
                      decisionMakerContributorId,
                      contributorsById,
                      reviewersById,
                    )}
                  />
                ) : null}
              </div>
            ) : null}
            {effectiveHasTagsAndCtaGroup ? (
              <div className="flex w-full min-w-0 shrink-0 flex-col gap-4">
                  {hasFiltersRow && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 4,
                        alignItems: 'center',
                        flex: 1,
                      }}
                    >
                  {!activeFilters.tags.all && activeFilters.tags.feedback && (
                    <FilterChip
                      prefix="Tags"
                      label="Feedback"
                      onRemove={() =>
                        setActiveFilters(
                          afterRemovingIncludedTag(activeFilters, {
                            ...activeFilters.tags,
                            all: false,
                            feedback: false,
                          }),
                        )
                      }
                    />
                  )}
                  {!activeFilters.tags.all && activeFilters.tags.changeRequests && (
                    <FilterChip
                      prefix="Tags"
                      label="Change Requests"
                      onRemove={() =>
                        setActiveFilters(
                          afterRemovingIncludedTag(activeFilters, {
                            ...activeFilters.tags,
                            all: false,
                            changeRequests: false,
                          }),
                        )
                      }
                    />
                  )}
                  {!activeFilters.tags.all && activeFilters.tags.replies && (
                    <FilterChip
                      prefix="Tags"
                      label="Replies"
                      onRemove={() =>
                        setActiveFilters(
                          afterRemovingIncludedTag(activeFilters, {
                            ...activeFilters.tags,
                            all: false,
                            replies: false,
                          }),
                        )
                      }
                    />
                  )}
                  {!activeFilters.tags.all && activeFilters.tags.notifications && (
                    <FilterChip
                      prefix="Tags"
                      label="Notifications"
                      onRemove={() =>
                        setActiveFilters(
                          afterRemovingIncludedTag(activeFilters, {
                            ...activeFilters.tags,
                            all: false,
                            notifications: false,
                          }),
                        )
                      }
                    />
                  )}
                  {!activeFilters.people.all &&
                    activeFilters.people.reviewerIds.map((reviewerId) => (
                      <FilterChip
                        key={reviewerId}
                        prefix="People"
                        label={reviewersById.get(reviewerId)?.name ?? reviewerId}
                        onRemove={() => {
                          const remaining = activeFilters.people.reviewerIds.filter(
                            (value) => value !== reviewerId
                          );
                          setActiveFilters({
                            ...activeFilters,
                            people:
                              remaining.length === 0
                                ? { all: true, reviewerIds: [] }
                                : { all: false, reviewerIds: remaining },
                          });
                        }}
                      />
                    ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveFilters({
                          tags: {
                            all: true,
                            feedback: false,
                            changeRequests: false,
                            replies: false,
                            notifications: false,
                          },
                          people: { all: true, reviewerIds: [] },
                        })
                      }
                      style={{
                        fontSize: 13,
                        fontWeight: 400,
                        color: '#6b5e55',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 0,
                        marginLeft: 'auto',
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                  )}

                {effectiveHasSubmitFeedbackCta && (() => {
                    const submitted = !currentUserHasNotSubmitted;
                    const isComparison = normalizedReviewType === 'compare';

                    if (reviewClosed) {
                      return (
                        <Tooltip label="The decision has been recorded for this review." fullWidth>
                          <span className="inline-flex w-full min-w-0">
                            <Button
                              variant="primary"
                              size="md"
                              label={submitFeedbackLabel}
                              fullWidth
                              className="w-full"
                              disabled
                              aria-disabled
                            />
                          </span>
                        </Tooltip>
                      );
                    }

                    if (submitted) {
                      // Reviewer has already submitted: disabled CTA with
                      // context-specific guidance. Compare reviewers update via
                      // the Decision Log kebab; all other types see the original
                      // unchanged copy.
                      const submittedTooltip = isComparison
                        ? "You've already submitted feedback. To update your preference, use the kebab menu on your entry in the Decision Log."
                        : "You've already submitted feedback for this review.";
                      return (
                        <Tooltip label={submittedTooltip} fullWidth>
                          <span className="inline-flex w-full min-w-0">
                            <Button
                              variant="primary"
                              size="md"
                              label="Submit Feedback"
                              fullWidth
                              className="w-full"
                              disabled
                              aria-disabled
                            />
                          </span>
                        </Tooltip>
                      );
                    }

                    // Compare Decision Maker submits their own concept preference
                    // like any other reviewer (enabled at Stage 1 / Stage 2). Once
                    // they submit, this CTA is hidden and "Make Decision" shows.
                    return (
                      <Tooltip label={submitFeedbackLabel} fullWidth className="w-full min-w-0">
                        <Button
                          variant="primary"
                          size="md"
                          label={submitFeedbackLabel}
                          fullWidth
                          className="w-full"
                          onClick={() => onOpenSubmitFeedbackDrawer()}
                        />
                      </Tooltip>
                    );
                  })()}
                  {effectiveHasDecisionCta && (
                    <Button
                      variant="primary"
                      size="md"
                      label={primaryFeedbackCta?.label ?? 'Make Decision'}
                      fullWidth
                      className="w-full"
                      disabled={!canCurrentUserMakeDecision}
                      onClick={handleMakeDecision}
                    />
                  )}
                </div>
              ) : null}
            <div className="flex min-h-0 flex-col gap-2">
              {showApproveStage2ReviewerCards ? (
                <div className="flex w-full flex-col gap-2">
                  {approveRhcReviewerEntries.map((entry) => {
                    if (
                      !activeFilters.people.all &&
                      (activeFilters.people.reviewerIds.length === 0 ||
                        !activeFilters.people.reviewerIds.includes(entry.reviewerId))
                    ) {
                      return null;
                    }
                    if (entry.status !== 'submitted') {
                      if (!activeFilters.tags.all && !activeFilters.tags.notifications) {
                        return null;
                      }
                      return (
                        <ApproveRhcReviewerPendingCard
                          key={entry.reviewerId}
                          reviewerName={entry.reviewerName}
                          reviewerId={entry.reviewerId}
                          reviewerEmail={entry.reviewerEmail}
                        />
                      );
                    }
                    if (entry.feedbackKind === 'approval') {
                      if (!activeFilters.tags.all && !activeFilters.tags.feedback) {
                        return null;
                      }
                      return (
                        <ApproveRhcReviewerReceivedCard
                          key={entry.reviewerId}
                          reviewerName={entry.reviewerName}
                          reviewerId={entry.reviewerId}
                          reviewerEmail={entry.reviewerEmail}
                          isResubmission={entry.isResubmission}
                        />
                      );
                    }
                    return null;
                  })}
                  {filteredCards
                    .filter((card) => card.cardType === 'change_request')
                    .map((card) => {
                      const entry = approveRhcReviewerEntries.find(
                        (row) => row.reviewerId === card.reviewerId,
                      );
                      if (
                        !entry ||
                        entry.status !== 'submitted' ||
                        entry.feedbackKind !== 'change-request'
                      ) {
                        return null;
                      }
                      if (!activeFilters.tags.all && !activeFilters.tags.changeRequests) {
                        return null;
                      }
                      const request = card.changeRequest;
                      const reviewer = request.reviewer_id
                        ? reviewersById.get(request.reviewer_id)
                        : null;
                      const reviewerName = reviewer?.name ?? 'Reviewer';
                      const changeRequestLabel =
                        changeRequestLabelById.get(request.id) ?? 'Change 1.1';
                      const changeArtifactLabels = labelsForArtifactSelectionKeys(
                        request.artifact_ids,
                        artifacts,
                      );
                      const crReplies = repliesByCardId.get(request.id) ?? [];
                      return (
                        <div
                          key={request.id}
                style={{
                            background: '#ffffff',
                            border: '1px solid #e4ddd3',
                            borderRadius: 8,
                            display: 'flex',
                            flexDirection: 'column',
                  gap: 10,
                            padding: 16,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              width: '100%',
                            }}
                          >
                            <Avatar
                              name={reviewerName}
                              size="md"
                              {...reviewerAvatarPropsForContributorId(
                                request.reviewer_id,
                                contributorsById,
                                reviewersById,
                                true,
                              )}
                            />
                            <span style={{ fontSize: 13, fontWeight: 500, color: '#2e1c1c' }}>
                              {reviewerName}
                  </span>
                            <span style={{ fontSize: 12, color: '#998c82' }}> </span>
                            <span style={{ flex: 1, fontSize: 12, color: '#998c82' }}>
                              {request.created_at ? (
                                <RelativeTimeText iso={request.created_at} />
                              ) : null}
                            </span>
                            <Tag
                              label={changeRequestLabel}
                              variant="butter"
                              size="sm"
                  />
                </div>
                          {request.changes_needed ? (
                            <p style={{ margin: 0, fontSize: 13, color: '#2e1c1c' }}>
                              {request.changes_needed}
                            </p>
                          ) : null}
                          {changeArtifactLabels.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {changeArtifactLabels.map((label) => (
                                <ChangeRequestArtifactTag
                                  key={`${request.id}-${label}`}
                                  label={label}
                                />
                              ))}
              </div>
            ) : null}
                          {crReplies.map((reply) => (
                            <div
                              key={reply.id}
                              className="flex gap-[10px] items-start rounded-[4px] bg-[#f3efe9] p-3"
                            >
                              <div className="flex min-w-0 flex-1 flex-col gap-2">
                                <div className="flex items-center gap-2 text-[12px] text-[#998c82]">
                                  <span>
                                    {reply.reply_by_name ??
                                      (reply.reply_by_id
                                        ? contactDisplayById?.[reply.reply_by_id] ??
                                          contributorsById?.get(reply.reply_by_id)?.name ??
                                          'Reviewer'
                                        : 'Reviewer')}
                                  </span>
                                  <span> </span>
                                  <RelativeTimeText iso={reply.created_at} />
                                </div>
                                <p className="break-words text-[13px] text-[#2e1c1c] m-0">
                                  {reply.reply_text}
                                </p>
                              </div>
          </div>
                          ))}
                          {!isReviewPaused ? (
                            <ChangeRequestReplyComposer
                              value={changeRequestReplies[request.id] ?? ''}
                              onChange={(next) =>
                                setChangeRequestReplies((prev) => ({
                                  ...prev,
                                  [request.id]: next,
                                }))
                              }
                              onSend={() => {
                                void onChangeRequestReply(request.id);
                              }}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                </div>
              ) : null}
              {showAlignFeedbackReceived ? (
                <div className="flex w-full flex-col gap-2">
                  {approveRhcReviewerEntries
                    .filter((entry) => entry.status === 'submitted')
                    .map((entry) => {
                      if (
                        !activeFilters.people.all &&
                        (activeFilters.people.reviewerIds.length === 0 ||
                          !activeFilters.people.reviewerIds.includes(entry.reviewerId))
                      ) {
                        return null;
                      }
                      const submissionChanges = changeRequests.filter(
                        (request) => request.reviewer_id === entry.reviewerId,
                      );
                      if (submissionChanges.length === 0) return null;
                      if (!activeFilters.tags.all && !activeFilters.tags.changeRequests) {
                        return null;
                      }
                      return (
                        <div
                          key={`${entry.reviewerId}-align-changes`}
                          className="flex flex-col gap-2"
                        >
                          {submissionChanges.map((request) => {
                            const reviewer = request.reviewer_id
                              ? reviewersById.get(request.reviewer_id)
                              : null;
                            const reviewerName = reviewer?.name ?? entry.reviewerName;
                            const changeRequestLabel =
                              changeRequestLabelById.get(request.id) ?? 'Change 1';
                            const changeArtifactLabels = labelsForArtifactSelectionKeys(
                              request.artifact_ids,
                              artifacts,
                            );
                            const crReplies = repliesByCardId.get(request.id) ?? [];
                            return (
                              <div
                                key={request.id}
                                style={{
                                  background: '#ffffff',
                                  border: '1px solid #e4ddd3',
                                  borderRadius: 8,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 10,
                                  padding: 16,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    width: '100%',
                                  }}
                                >
                                  <Avatar
                                    name={reviewerName}
                                    size="md"
                                    {...reviewerAvatarPropsForContributorId(
                                request.reviewer_id,
                                contributorsById,
                                reviewersById,
                                true,
                              )}
                                  />
                                  <span style={{ fontSize: 13, fontWeight: 500, color: '#2e1c1c' }}>
                                    {reviewerName}
                                  </span>
                                  <span style={{ fontSize: 12, color: '#998c82' }}> </span>
                                  <span style={{ flex: 1, fontSize: 12, color: '#998c82' }}>
                                    {request.created_at ? (
                                      <RelativeTimeText iso={request.created_at} />
                                    ) : null}
                                  </span>
                                  <Tag
                                    label={changeRequestLabel}
                                    variant="butter"
                                    size="sm"
                                  />
                                </div>
                                {request.changes_needed ? (
                                  <p style={{ margin: 0, fontSize: 13, color: '#2e1c1c' }}>
                                    {request.changes_needed}
                                  </p>
                                ) : null}
                                {changeArtifactLabels.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {changeArtifactLabels.map((label) => (
                                      <ChangeRequestArtifactTag
                                        key={`${request.id}-${label}`}
                                        label={label}
                                      />
                                    ))}
                                  </div>
                                ) : null}
                                {crReplies.map((reply) => (
                                  <div
                                    key={reply.id}
                                    className="flex gap-[10px] items-start rounded-[4px] bg-[#f3efe9] p-3"
                                  >
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                      <div className="flex items-center gap-2 text-[12px] text-[#998c82]">
                                        <span>
                                          {reply.reply_by_name ??
                                            (reply.reply_by_id
                                              ? contactDisplayById?.[reply.reply_by_id] ??
                                                contributorsById?.get(reply.reply_by_id)?.name ??
                                                'Reviewer'
                                              : 'Reviewer')}
                                        </span>
                                        <span> </span>
                                        <RelativeTimeText iso={reply.created_at} />
                                      </div>
                                      <p className="break-words text-[13px] text-[#2e1c1c] m-0">
                                        {reply.reply_text}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                                {!compareReviewFullyLocked &&
                                !reviewClosed &&
                                !isReviewPaused ? (
                                  <ChangeRequestReplyComposer
                                    value={changeRequestReplies[request.id] ?? ''}
                                    onChange={(next) =>
                                      setChangeRequestReplies((prev) => ({
                                        ...prev,
                                        [request.id]: next,
                                      }))
                                    }
                                    onSend={() => {
                                      void onChangeRequestReply(request.id);
                                    }}
                                  />
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>
              ) : null}
              {showApproveFeedbackReceived ? (
                <div className="flex w-full flex-col gap-2">
                  {approveRhcReviewerEntries.map((entry) => {
                    if (
                      !activeFilters.people.all &&
                      (activeFilters.people.reviewerIds.length === 0 ||
                        !activeFilters.people.reviewerIds.includes(entry.reviewerId))
                    ) {
                      return null;
                    }
                    if (entry.status !== 'submitted') {
                      if (!activeFilters.tags.all && !activeFilters.tags.notifications) {
                        return null;
                      }
                      return (
                        <ApproveRhcReviewerPendingCard
                          key={entry.reviewerId}
                          reviewerName={entry.reviewerName}
                          reviewerId={entry.reviewerId}
                          reviewerEmail={entry.reviewerEmail}
                        />
                      );
                    }
                    if (entry.feedbackKind === 'approval') {
                      if (!activeFilters.tags.all && !activeFilters.tags.feedback) {
                        return null;
                      }
                      return (
                        <ApproveRhcReviewerReceivedCard
                          key={entry.reviewerId}
                          reviewerName={entry.reviewerName}
                          reviewerId={entry.reviewerId}
                          reviewerEmail={entry.reviewerEmail}
                          isResubmission={entry.isResubmission}
                        />
                      );
                    }
                    if (!activeFilters.tags.all && !activeFilters.tags.changeRequests) {
                      return null;
                    }
                    return (
                      <div key={`${entry.reviewerId}-changes`} className="flex flex-col gap-2">
                        {changeRequests
                          .filter((request) => request.reviewer_id === entry.reviewerId)
                          .map((request) => {
                            const reviewer = request.reviewer_id
                              ? reviewersById.get(request.reviewer_id)
                              : null;
                            const reviewerName = reviewer?.name ?? entry.reviewerName;
                            const changeRequestLabel =
                              changeRequestLabelById.get(request.id) ?? 'Change 1.1';
                            const changeArtifactLabels = labelsForArtifactSelectionKeys(
                              request.artifact_ids,
                              artifacts,
                            );
                            const crReplies = repliesByCardId.get(request.id) ?? [];
                            return (
                              <div
                                key={request.id}
              style={{
                                  background: '#ffffff',
                                  border: '1px solid #e4ddd3',
                                  borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                                  gap: 10,
                                  padding: 16,
                                }}
                              >
            <div
              style={{
                display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    width: '100%',
                                  }}
                                >
                                  <Avatar
                                    name={reviewerName}
                                    size="md"
                                    {...reviewerAvatarPropsForContributorId(
                                request.reviewer_id,
                                contributorsById,
                                reviewersById,
                                true,
                              )}
                                  />
                                  <span style={{ fontSize: 13, fontWeight: 500, color: '#2e1c1c' }}>
                                    {reviewerName}
                                  </span>
                                  <span style={{ fontSize: 12, color: '#998c82' }}> </span>
                                  <span style={{ flex: 1, fontSize: 12, color: '#998c82' }}>
                                    {request.created_at ? (
                                      <RelativeTimeText iso={request.created_at} />
                                    ) : null}
                                  </span>
                                  <Tag
                                    label={changeRequestLabel}
                                    variant="butter"
                                    size="sm"
                                  />
                                </div>
                                {request.changes_needed ? (
                                  <p style={{ margin: 0, fontSize: 13, color: '#2e1c1c' }}>
                                    {request.changes_needed}
                                  </p>
                                ) : null}
                                {changeArtifactLabels.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {changeArtifactLabels.map((label) => (
                                      <ChangeRequestArtifactTag
                                        key={`${request.id}-${label}`}
                                        label={label}
                                      />
                                    ))}
                                  </div>
                                ) : null}
                                {crReplies.map((reply) => (
                                  <div
                                    key={reply.id}
                                    className="flex gap-[10px] items-start rounded-[4px] bg-[#f3efe9] p-3"
                                  >
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                      <div className="flex items-center gap-2 text-[12px] text-[#998c82]">
                                        <span>
                                          {reply.reply_by_name ??
                                            (reply.reply_by_id
                                              ? contactDisplayById?.[reply.reply_by_id] ??
                                                contributorsById?.get(reply.reply_by_id)?.name ??
                                                'Reviewer'
                                              : 'Reviewer')}
                                        </span>
                                        <span> </span>
                                        <RelativeTimeText iso={reply.created_at} />
                                      </div>
                                      <p className="break-words text-[13px] text-[#2e1c1c] m-0">
                                        {reply.reply_text}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                                {!isReviewPaused ? (
                                  <ChangeRequestReplyComposer
                                    value={changeRequestReplies[request.id] ?? ''}
                                    onChange={(next) =>
                                      setChangeRequestReplies((prev) => ({
                                        ...prev,
                                        [request.id]: next,
                                      }))
                                    }
                                    onSend={() => {
                                      void onChangeRequestReply(request.id);
                                    }}
                                  />
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {!showApproveFeedbackReceived && stage === 1 && !isReviewPaused && (
                <div
                  className="flex w-full flex-col items-center rounded-[8px] border border-[#e4ddd3] bg-[#f3efe9] p-6"
                  style={{ gap: 16 }}
                >
                  <p
                    className="m-0 text-center text-[14px] font-medium text-[#998c82]"
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  >
                    Reviewers have not been assigned to this review yet.
                  </p>
                  <div
                    ref={rhcAddReviewersAnchorRef}
                    className="relative flex w-full flex-col items-center"
                  >
                    {reviewClosed ? (
                      <Tooltip
                        label="Reopen this review to add reviewers"
                        position="top"
                      >
                        <span className="inline-flex">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon="leading"
                            iconName="plus"
                            label="Add Reviewers"
                            disabled
                          />
                        </span>
                      </Tooltip>
                    ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="leading"
                      iconName="plus"
                      label="Add Reviewers"
                      aria-expanded={rhcReviewerPopoverOpen}
                      aria-haspopup="dialog"
                      onClick={() => {
                        setRhcReviewerPopoverOpen((open) => !open);
                        setRhcSelectedReviewerIds([]);
                      }}
                    />
                    )}
                    {rhcReviewerPopoverOpen ? (
                      <div
                        ref={rhcAddReviewersPopoverRef}
                        className="absolute left-0 right-0 top-full z-50 mt-2 flex flex-col overflow-hidden rounded-[8px] border border-[#e4ddd3] bg-white shadow-[0px_8px_16px_rgba(41,33,28,0.15)]"
                        role="dialog"
                        aria-label="Add reviewers"
                      >
                        <div className="max-h-[280px] overflow-y-auto overflow-x-hidden py-1">
                          {assignableContributors.length === 0 ? (
                            <p className="m-0 px-3 py-2 text-[13px] text-[#998c82]">
                              No teammates available to add.
                            </p>
                          ) : (
                            assignableContributors.map((contributor) => (
                              <label
                                key={contributor.id}
                                className="flex cursor-pointer items-center gap-2 px-3 py-2"
                              >
                                <Checkbox
                                  id={`rhc-reviewer-${contributor.id}`}
                                  label=""
                                  checked={rhcSelectedReviewerIds.includes(contributor.id)}
                                  onChange={(checked) => {
                                    setRhcSelectedReviewerIds((prev) =>
                                      checked
                                        ? [...prev, contributor.id]
                                        : prev.filter((id) => id !== contributor.id),
                                    );
                                  }}
                                />
                                <Avatar
                                  name={contributor.name}
                                  contributorId={contributor.id}
                                  size="md"
                                  style={avatarInlinePaletteStyle(
                                    contributor.email,
                                    contributor.id,
                                    true,
                                  )}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-medium text-[#2e1c1c]">
                                    {contributor.name}
                                    {contributor.isPending ? (
                                      <span className="ml-1.5 font-normal text-[#998c82]">
                                        pending
                                      </span>
                                    ) : null}
                                  </span>
                                  {contributor.role ? (
                                    <span className="block truncate text-[12px] text-[#998c82]">
                                      {contributor.role}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                        <div className="border-t border-[#e4ddd3] px-3 py-2">
                          <Button
                            variant="primary"
                            size="sm"
                            label={rhcSavingReviewers ? 'Saving' : 'Done'}
                            disabled={rhcSavingReviewers || rhcSelectedReviewerIds.length === 0}
                            className="w-full"
                            onClick={() => {
                              if (rhcSavingReviewers || rhcSelectedReviewerIds.length === 0) {
                                return;
                              }
                              onAddReviewers({
                                reviewerIds: rhcSelectedReviewerIds,
                                source: 'rhc',
                                onStartSaving: () => setRhcSavingReviewers(true),
                                onFinishSaving: () => setRhcSavingReviewers(false),
                                onSuccess: () => {
                                  setRhcSelectedReviewerIds([]);
                                  setRhcReviewerPopoverOpen(false);
                                },
                              });
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              {!showApproveFeedbackReceived &&
              !showApproveStage2ReviewerCards &&
              rhcCardsForRender.map((card) => {
                if (card.cardType === 'feedback' || card.cardType === 'notification') {
                  const thread = card.thread;
                  const threadReplies = repliesByCardId.get(thread.id) ?? [];
                  return (
                    <FeedbackThreadCommentCard
                      key={thread.id}
                      thread={thread}
                      threadReplies={threadReplies}
                      reviewType={reviewType}
                      cardCategory={
                        card.cardType === 'notification' ? 'notification' : 'feedback'
                      }
                      currentContributorId={currentContributorId}
                      canCurrentUserMakeDecision={canCurrentUserMakeDecision}
                      contributorsById={contributorsById}
                      contactDisplayById={contactDisplayById}
                      artifacts={artifacts}
                      reviewOwnerName={reviewOwnerName}
                      onFeedbackReply={onFeedbackReply}
                      onMakeDecision={handleMakeDecision}
                      disableReplies={
                        compareReviewFullyLocked || reviewClosed || isReviewPaused
                      }
                      userIdByContributorId={userIdByContributorId}
                    />
                  );
                }

                const request = card.changeRequest;
                const reviewer = request.reviewer_id ? reviewersById.get(request.reviewer_id) : null;
                const reviewerName = reviewer?.name ?? 'Reviewer';
                const changeRequestLabel =
                  changeRequestLabelById.get(request.id) ?? 'Change 1.1';
                const changeArtifactLabels = labelsForArtifactSelectionKeys(
                  request.artifact_ids,
                  artifacts,
                );
                const crReplies = repliesByCardId.get(request.id) ?? [];
                return (
                  <div
                    key={request.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e4ddd3',
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                      <Avatar
                        name={reviewerName}
                        size="md"
                        {...reviewerAvatarPropsForContributorId(
                          request.reviewer_id,
                          contributorsById,
                          reviewersById,
                          true,
                        )}
                      />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#2e1c1c' }}>
                        {reviewerName}
                      </span>
                      <span style={{ fontSize: 12, color: '#998c82' }}> </span>
                      <span style={{ flex: 1, fontSize: 12, color: '#998c82' }}>
                        {request.created_at ? (
                          <RelativeTimeText iso={request.created_at} />
                        ) : null}
                      </span>
                      <Tag label={changeRequestLabel} variant="butter" size="sm" />
                    </div>

                    {request.changes_needed ? (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          color: '#2e1c1c',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        }}
                      >
                        {request.changes_needed}
                      </p>
                    ) : null}

                    {changeArtifactLabels.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {changeArtifactLabels.map((label) => (
                          <ChangeRequestArtifactTag
                            key={`${request.id}-${label}`}
                            label={label}
                          />
                        ))}
                      </div>
                    ) : null}

                    {crReplies.map((reply) => (
                      <div
                        key={reply.id}
                        className="flex gap-[10px] items-start rounded-[4px] bg-[#f3efe9] p-3"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex items-center gap-2 text-[12px] text-[#998c82]">
                            <span>
                              {reply.reply_by_name ??
                                (reply.reply_by_id
                                  ? contactDisplayById?.[reply.reply_by_id] ??
                                    contributorsById?.get(reply.reply_by_id)?.name ??
                                    'Reviewer'
                                  : 'Reviewer')}
                            </span>
                            <span> </span>
                            <RelativeTimeText iso={reply.created_at} />
                          </div>
                          <p className="break-words text-[13px] text-[#2e1c1c] m-0">
                            {reply.reply_text}
                          </p>
                        </div>
                      </div>
                    ))}

                    {!compareReviewFullyLocked && !reviewClosed && !isReviewPaused ? (
                    <ChangeRequestReplyComposer
                      value={changeRequestReplies[request.id] ?? ''}
                      onChange={(next) =>
                        setChangeRequestReplies((prev) => ({
                          ...prev,
                          [request.id]: next,
                        }))
                      }
                      onSend={() => {
                        void onChangeRequestReply(request.id);
                      }}
                    />
                    ) : null}
                  </div>
                );
              })}
            <div className="shrink-0 h-6" aria-hidden="true" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-4 gap-4">
          <Button
            type="button"
            label="Expand feedback panel"
            aria-label="Expand feedback panel"
            variant="secondary"
            size="sm"
            icon="leading"
            iconOnly
            iconName="open-drawer"
            style={headerIconOnlyButtonStyle}
            onClick={onToggle}
          />
          {showCollapsedBadge ? (
            <NotificationBadge
              variant="number"
              sentiment="brand"
              count={collapsedBadgeCount}
            />
          ) : null}
        </div>
      )}
    </aside>
  );
}
