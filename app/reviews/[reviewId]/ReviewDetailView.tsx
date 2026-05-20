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
} from 'react';
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
import { formatDistanceToNow } from '@/lib/formatDistanceToNow';
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
  removeReviewerAction,
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
import { SubmitFeedbackDrawer } from './SubmitFeedbackDrawer';
import { ActivityTab } from './ActivityTab';
import { EditReviewDrawer } from './EditReviewDrawer';
import { EditReviewTypeModal } from './EditReviewTypeModal';
import { FinalDecisionDrawer } from '@/components/FinalDecisionDrawer';
import modalStyles from '@/components/ui/ds/Modal.module.css';
import { generateArtifactDescription } from '@/app/actions/generateArtifactDescription';

//  Types 

type ReviewMode = 'edit' | 'view-only';

export interface ReviewArtifact {
  id: string;
  label: string;
  title: string | null;
  /** Raw upload filename from artifacts jsonb (for display when title is empty). */
  originalFileName: string | null;
  type: 'Figma' | 'PDF' | 'Image';
  iteration: string;
  description: string;
  /** Direct file URL for image / PDF previews. */
  imageUrl: string | null;
  /** Original link (Figma etc.) used to drive the embed iframe. */
  linkUrl: string | null;
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
}

interface Reviewer {
  id: string;
  name: string;
  role: string;
  variant: 'lilac' | 'default';
}
export interface ReviewerAssignment {
  id: string;
  name: string;
  role: string;
  isDecisionMaker: boolean;
}
interface ContributorOption {
  id: string;
  name: string;
  role: string;
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
  authorAvatarSrc?: string;
  timestamp: string;
  type: 'Feedback' | 'Decision' | 'Question';
  text?: string;
  optionTag?: string;
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
}

/** Row from `card_replies` (append-only thread replies). */
export interface CardReplyRow {
  id: string;
  card_type: 'feedback' | 'change_request';
  card_id: string;
  reply_text: string;
  reply_by_id: string | null;
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

export interface ReviewDetailViewProps {
  reviewId: string;
  title: string;
  /** DB-normalized status (e.g. 'in-review', 'approved', 'needs-changes', 'blocked', 'draft', 'closed'). */
  status: string;
  reviewType: string;
  reviewFocus: string;
  projectId: string;
  projectName: string;
  mode: ReviewMode;
  /** Real artifacts parsed from the `reviews.artifacts` jsonb column. */
  artifacts: ReviewArtifact[];
  /** Project problems, pre-flagged with `selected` for members of `related_problem_ids`. */
  problems: Problem[];
  contributors: ContributorOption[];
  assignedReviewers: ReviewerAssignment[];
  feedbackEntries: ReviewerFeedbackEntry[];
  changeRequests: ReviewChangeRequestEntry[];
  cardReplies: CardReplyRow[];
  currentContributorId: string | null;
  currentContributorRole: string | null;
  /** From `contributors.permission_level` for the effective viewer (e.g. editor, admin, reviewer). */
  currentContributorPermissionLevel?: string | null;
  requireDecisionMaker: boolean;
  decisionMakerId?: string | null;
  /** Contributor id → display name via `contact_names`. */
  contactDisplayById?: Record<string, string>;
  decision: DecisionData;
  reviewOwnerName: string | null;
  lastReminderSentAt?: string | null;
  reviewCreatedAt?: string | null;
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

const RHC_OPEN_WIDTH = 500;
const RHC_CLOSED_WIDTH = 48;
const RHC_STORAGE_KEY = 'designtrace_rhc_open';

// All top-level sections in the main scroll area (order matches layout).
const NAV_SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'review-focus', label: 'Details' },
  { id: 'designs', label: 'Designs' },
  { id: 'problems', label: 'Problems' },
  { id: 'tradeoffs', label: 'Tradeoffs & Risks' },
  { id: 'reviewers', label: 'Reviewers' },
];

function normStatus(raw: string | null | undefined) {
  return String(raw ?? '').trim().toLowerCase();
}

function isCompleteLifecycle(raw: string) {
  const k = normStatus(raw);
  return (
    k === 'complete' ||
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
}): { label: string; color: StatusPillColor } {
  const k = normStatus(args.raw);
  if (k === 'draft') return { label: 'Draft', color: 'mushroom' };
  if (k === 'in-review') return { label: 'In Review', color: 'butter' };
  if (k === 'feedback-submitted') {
    return { label: 'Feedback Submitted', color: 'blue' };
  }
  if (k === 'paused') return { label: 'Paused', color: 'mushroom' };
  if (isCompleteLifecycle(args.raw)) {
    return {
      label: 'Complete',
      color: completeLifecyclePillColor(args.decisionStatus),
    };
  }
  if (k === 'blocked') return { label: 'Blocked', color: 'error' };
  if (k === 'closed') return { label: 'Closed', color: 'mushroom' };
  return { label: 'Draft', color: 'mushroom' };
}

/** Designer-only lifecycle transitions (Draft / Paused / resume / Complete). */
function manualLifecycleMenuFor(
  raw: string,
  reviewTypeNorm: string,
): Array<{ value: string; label: string }> {
  const k = normStatus(raw);
  const rt = normStatus(reviewTypeNorm);
  const rtNorm =
    rt === 'comparison'
      ? 'compare'
      : rt === 'approval'
        ? 'approve'
        : rt === 'alignment'
          ? 'align'
          : rt;

  if (k === 'draft') {
    return [
      { value: 'in-review', label: 'In Review' },
      { value: 'paused', label: 'Paused' },
    ];
  }
  if (k === 'in-review') {
    return [
      { value: 'draft', label: 'Draft' },
      { value: 'paused', label: 'Paused' },
    ];
  }
  if (k === 'paused') {
    return [
      { value: 'draft', label: 'Draft' },
      { value: 'in-review', label: 'In Review' },
    ];
  }
  if (k === 'feedback-submitted') {
    if (rtNorm === 'critique' || rtNorm === 'align') {
      return [{ value: 'complete', label: 'Complete' }];
    }
    return [];
  }
  return [];
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

function formatRequestedAtTooltip(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.toLocaleString('en-US', { month: 'long' });
  const day = toOrdinalDay(date.getDate());
  const year = date.getFullYear();
  const time = date
    .toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
  return `${month} ${day}, ${year} @ ${time}`;
}

function formatReviewDetailsDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.toLocaleString('en-US', { month: 'long' });
  const day = date.getDate();
  const year = date.getFullYear();
  const time = date
    .toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
  return `${month} ${day}, ${year} @ ${time}`;
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

function buildChangeRequestLabelById(
  requests: ReviewChangeRequestEntry[],
): Map<string, string> {
  const byGroup = new Map<string, ReviewChangeRequestEntry[]>();
  for (const r of requests) {
    const key = r.batch_id ?? `__solo_${r.id}`;
    const list = byGroup.get(key) ?? [];
    list.push(r);
    byGroup.set(key, list);
  }
  const groups = Array.from(byGroup.values()).map((items) =>
    [...items].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
  );
  groups.sort(
    (a, b) =>
      new Date(a[0]?.created_at ?? 0).getTime() -
      new Date(b[0]?.created_at ?? 0).getTime(),
  );
  const labelById = new Map<string, string>();
  groups.forEach((items, parentIdx) => {
    items.forEach((item, subIdx) => {
      labelById.set(item.id, `${parentIdx + 1}.${subIdx + 1}`);
    });
  });
  return labelById;
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

//  View 

export function ReviewDetailView({
  reviewId,
  title,
  status: rawStatus,
  reviewType,
  reviewFocus: reviewFocusProp,
  projectId,
  projectName,
  mode,
  artifacts: artifactsProp,
  problems: problemsProp,
  contributors,
  assignedReviewers,
  feedbackEntries,
  changeRequests,
  cardReplies: cardRepliesProp = [],
  currentContributorId,
  currentContributorRole,
  currentContributorPermissionLevel = null,
  requireDecisionMaker,
  decisionMakerId = null,
  contactDisplayById = {},
  decision: decisionData,
  reviewOwnerName,
  lastReminderSentAt: lastReminderSentAtProp = null,
  reviewCreatedAt = null,
  activeTabIndex = 0,
  tradeoffs: tradeoffsProp = [],
}: ReviewDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const canEditCoreDetails = canEditReviewDetails(currentContributorRole);
  const isForcedViewOnly = canUseViewOnlyReviewMode({
    requestedMode: mode,
    canEditCoreDetails,
  });
  const coreInteractionMode: ReviewMode = isForcedViewOnly ? 'view-only' : 'edit';
  const canAddTradeoffs = canAddTradeoff({
    currentContributorId,
    requestedMode: mode,
  });
  const rawReviewType = reviewType.trim().toLowerCase();
  const normalizedReviewType =
    rawReviewType === 'comparison'
      ? 'compare'
      : rawReviewType === 'approval'
        ? 'approve'
        : rawReviewType === 'alignment'
          ? 'align'
          : rawReviewType;
  const reviewTypePillLabel =
    normalizedReviewType === 'compare'
      ? 'COMPARE'
      : normalizedReviewType === 'approve'
        ? 'APPROVE'
        : normalizedReviewType === 'critique'
          ? 'CRITIQUE'
          : 'ALIGN';

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
      variant: reviewer.isDecisionMaker ? 'lilac' : 'default',
    }))
  );
  const [savingReviewers, setSavingReviewers] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [lastReminderSentAt, setLastReminderSentAt] = useState<string | null>(
    lastReminderSentAtProp,
  );

  useEffect(() => {
    setLastReminderSentAt(lastReminderSentAtProp);
  }, [lastReminderSentAtProp]);

  const isReminderRateLimited = useMemo(() => {
    if (!lastReminderSentAt) return false;
    const sentAt = new Date(lastReminderSentAt).getTime();
    if (Number.isNaN(sentAt)) return false;
    return Date.now() - sentAt < 24 * 60 * 60 * 1000;
  }, [lastReminderSentAt]);

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
        const rateLimitedAt =
          data.last_sent_at ?? data.last_reminder_sent_at ?? lastReminderSentAt;
        if (rateLimitedAt) setLastReminderSentAt(rateLimitedAt);
        showToast('A reminder was already sent today');
        return false;
      }
      if (!res.ok) {
        showToast('Failed to send reminder — please try again');
        return false;
      }
      if (data.last_reminder_sent_at) {
        setLastReminderSentAt(data.last_reminder_sent_at);
      }
      const sent = typeof data.sent === 'number' ? data.sent : 0;
      if (sent === 0) {
        showToast('No pending reviewers to remind');
      } else {
        const label = sent === 1 ? 'reviewer' : 'reviewers';
        showToast(`Reminder sent to ${sent} ${label}`);
      }
      return sent > 0;
    } catch {
      showToast('Failed to send reminder — please try again');
      return false;
    } finally {
      setSendingReminder(false);
    }
  }, [reviewId, sendingReminder, showToast, lastReminderSentAt]);
  const [showFeedbackDrawer, setShowFeedbackDrawer] = useState(false);
  const [showFinalDecisionDrawer, setShowFinalDecisionDrawer] = useState(false);
  const [feedbackSubmitToast, setFeedbackSubmitToast] = useState<string | null>(null);
  const [reviewDetailsSaveErrorToast, setReviewDetailsSaveErrorToast] = useState<string | null>(null);
  const [showEditTypeModal, setShowEditTypeModal] = useState(false);
  const lastSavedReviewFocusRef = useRef(reviewFocusProp);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [headerStatusOverride, setHeaderStatusOverride] = useState<string | null>(null);
  const [headerLifecycleMenuOpen, setHeaderLifecycleMenuOpen] = useState(false);
  const [reviewMenu, setReviewMenu] = useState<null | 'header'>(null);
  const [lifecycleToast, setLifecycleToast] = useState<string | null>(null);
  const [editReviewDrawerOpen, setEditReviewDrawerOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const headerStatusRef = useRef<HTMLDivElement | null>(null);
  const pageKebabSectionRef = useRef<HTMLDivElement | null>(null);
  const [changeRequestReplies, setChangeRequestReplies] = useState<Record<string, string>>({});
  const [tabIndex, setTabIndex] = useState(activeTabIndex);
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
  const [reviewerMenuOpen, setReviewerMenuOpen] = useState(false);
  const [reviewerSearch, setReviewerSearch] = useState('');
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<string[]>([]);
  const [allSystemContributors, setAllSystemContributors] = useState<ContributorOption[]>(
    contributors
  );
  const [reviewerModalOpen, setReviewerModalOpen] = useState(false);
  const reviewerAnchorRef = useRef<HTMLDivElement | null>(null);
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
  const showDecisionLog =
    normalizedReviewType === 'compare' || normalizedReviewType === 'approve';
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
  const lifecycleUi = resolveHeaderLifecycle({
    raw: displayRawStatus,
    decisionStatus: decisionData.status,
  });
  const manualLifecycleOptions = useMemo(
    () =>
      canEditCoreDetails && coreInteractionMode === 'edit'
        ? manualLifecycleMenuFor(displayRawStatus, normalizedReviewType)
        : [],
    [canEditCoreDetails, coreInteractionMode, displayRawStatus, normalizedReviewType],
  );

  const handleLifecyclePick = useCallback(
    async (next: string) => {
      setHeaderLifecycleMenuOpen(false);
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
      router.refresh();
    },
    [reviewId, router],
  );

  const pageHeaderStatusSlot = useMemo(() => {
    const canOpenMenu = manualLifecycleOptions.length > 0;
    return (
      <div ref={headerStatusRef} style={{ position: 'relative' }}>
        <StatusPill
          color={lifecycleUi.color}
          appearance="filled"
          label={lifecycleUi.label}
          size="lg"
          state={canOpenMenu ? 'interactive' : 'default'}
          onClick={
            canOpenMenu
              ? () => {
                  setHeaderLifecycleMenuOpen((o) => !o);
                  setReviewMenu(null);
                }
              : undefined
          }
        />
        {canOpenMenu ? (
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
  }, [
    lifecycleUi.color,
    lifecycleUi.label,
    manualLifecycleOptions,
    headerLifecycleMenuOpen,
    displayRawStatus,
    handleLifecyclePick,
  ]);

  const reviewOptionsMenu = useMemo(
    () => (
      <Menu
        open={reviewMenu !== null}
        onClose={() => setReviewMenu(null)}
        anchorRef={pageKebabSectionRef}
        align="right"
        aria-label="Review options"
        type="dropdown"
      >
        <MenuItem label="Edit Review" disabled />
        <MenuItem
          label="Archive Review"
          onClick={() => {
            setReviewMenu(null);
            setArchiveConfirmOpen(true);
          }}
        />
      </Menu>
    ),
    [reviewMenu],
  );

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
        variant: reviewer.isDecisionMaker ? 'lilac' : 'default',
      }))
    );
  }, [assignedReviewers]);

  // Close the "Select from project" dropdown on outside click. Gated on the
  // open flag so the listener is only live while the dropdown is open  a
  // dormant global pointerdown listener previously blocked navigation.
  useEffect(() => {
    if (!selectMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!addButtonRef.current?.contains(e.target as Node)) {
        setSelectMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
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
    if (!reviewerMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!reviewerAnchorRef.current?.contains(e.target as Node)) {
        setReviewerMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [reviewerMenuOpen]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void supabase
      .from('contributors')
      .select('id, name, email, role')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!Array.isArray(data)) return;
        const mapped = data.map((row) => ({
          id: String((row as Record<string, unknown>).id ?? ''),
          name: String((row as Record<string, unknown>).name ?? ''),
          role: String((row as Record<string, unknown>).role ?? ''),
        }));
        const projectContributorIds = new Set(
          contributors.map((contributor) => contributor.id)
        );
        mapped.sort((a, b) => {
          const aProject = projectContributorIds.has(a.id) ? 0 : 1;
          const bProject = projectContributorIds.has(b.id) ? 0 : 1;
          if (aProject !== bProject) return aProject - bProject;
          return a.name.localeCompare(b.name);
        });
        setAllSystemContributors(mapped);
      });
  }, [contributors]);

  // Project problems not already linked to this review  drives the Select menu.
  const remainingProblems = allProjectProblems.filter(
    (ap) => !problems.some((p) => p.id === ap.id)
  );
  const availableContributors = allSystemContributors.filter(
    (contributor) =>
      (reviewerSearch.trim() === '' ||
        contributor.name.toLowerCase().includes(reviewerSearch.toLowerCase()))
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
  const closeTradeoffModal = () => {
    setTradeoffModalOpen(false);
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
  const [rhcOpen, setRhcOpen] = useState<boolean>(true);
  const [rhcHydrated, setRhcHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(RHC_STORAGE_KEY);
    if (stored !== null) setRhcOpen(stored === 'true');
    setRhcHydrated(true);
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

  // NOTE: `offsetTop` is relative to the nearest offset parent, not the scroll
  // container, so computing it against `scrollRootRef` gave incorrect offsets
  // and stopped the nav from scrolling. `scrollIntoView` walks up to the
  // element's own scroll container and lands the heading at the top.
  const scrollToSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const isDecisionMaker = Boolean(
    currentContributorId &&
      assignedDecisionOwnerId &&
      currentContributorId === assignedDecisionOwnerId
  );
  const decisionMade =
    Boolean(decisionData.madeAt) ||
    Boolean(decisionData.text) ||
    (decisionData.status !== null &&
      decisionData.status !== 'in-review' &&
      decisionData.status !== 'draft');
  const decisionStatusUnset =
    decisionData.status == null || String(decisionData.status ?? '').trim() === '';
  const showComparisonButterPromptDm =
    normalizedReviewType === 'compare' &&
    normStatus(rawStatus) === 'feedback-submitted' &&
    decisionStatusUnset &&
    Boolean(decisionMakerId && String(decisionMakerId).trim()) &&
    Boolean(currentContributorId && currentContributorId === String(decisionMakerId).trim());
  const comparisonDecisionPromptRowName = showComparisonButterPromptDm
    ? contactNameFromMap(contactDisplayById, currentContributorId, 'Reviewer')
    : null;
  const showDecisionPromptReadonly =
    (normalizedReviewType === 'compare' || normalizedReviewType === 'approve') &&
    normStatus(rawStatus) === 'feedback-submitted' &&
    decisionStatusUnset &&
    Boolean(assignedDecisionOwnerId) &&
    !showComparisonButterPromptDm &&
    Boolean(
      currentContributorId &&
        assignedDecisionOwnerId &&
        currentContributorId !== assignedDecisionOwnerId,
    );
  const feedbackByReviewerId = new Map(
    feedbackEntries.map((entry) => [entry.reviewerId, { status: entry.status }])
  );
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
      timestamp: entry.submittedAt
        ? formatDistanceToNow(new Date(entry.submittedAt), { addSuffix: true })
        : '',
      type: entry.feedbackText ? 'Feedback' : 'Feedback',
      text: entry.feedbackText ?? undefined,
      optionTag: entry.selectedOption ?? undefined,
      replies: undefined,
      status: entry.status,
      requestedAt: entry.requestedAt,
    };
  });
  const feedbackThreadById = new Map(feedbackThreads.map((thread) => [thread.id, thread]));
  const pendingFeedbackCount = feedbackThreads.filter(
    (c) => c.status === 'pending' || c.status === 'decision-required'
  ).length;
  const canSubmitFeedback = canSubmitFeedbackByRole({
    currentContributorId,
    reviewerIds,
    feedbackByReviewerId: new Map(
      resolvedFeedbackEntries.map((entry) => [entry.reviewerId, { status: entry.status }])
    ),
  });
  const canCurrentUserMakeDecision = canMakeDecision({
    currentContributorId,
    decisionMakerReviewerId: assignedDecisionOwnerId,
    allReviewerFeedbackSubmitted,
    decisionMade,
  });
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
  const reviewersForMenu: MenuSectionsReviewer[] = assignedReviewers.map((reviewer) => ({
    id: reviewer.id,
    name: reviewer.name,
    initials: initialsFromName(reviewer.name),
  }));
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
    if (!activeFilters.people.all && activeFilters.people.reviewerIds.length > 0) {
      if (!activeFilters.people.reviewerIds.includes(card.reviewerId ?? '')) return false;
    }
    return true;
  });
  const totalCardCount = feedbackThreads.length + changeRequests.length;
  const changeRequestLabelById = buildChangeRequestLabelById(changeRequests);
  const decisionTextTrimmed = (decisionData.text ?? '').trim();
  const decisionArtifactIds = (decisionData.selectedArtifactIds ?? []).filter(Boolean);
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
          return artifact?.title ?? artifact?.label ?? id;
        }),
        decisionText: decisionData.text ?? '',
        ownerName: decisionAttributionName,
        recordedAtIso: decisionData.madeAt ?? null,
        tradeOffNote: decisionData.tradeOffNote ?? undefined,
        tradeOffIsAI: decisionData.tradeOffIsAI ?? undefined,
      }
    : null;

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
                description: '',
                descriptionAiState: 'error',
                aiGenerated: false,
              }
            : a,
        ),
      );
      return;
    }

    setArtifacts((prev) =>
      prev.map((a) =>
        a.id === artifactId
          ? {
              ...a,
              description: result.description,
              descriptionAiState: 'ai_generated',
              aiGenerated: true,
            }
          : a,
      ),
    );
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
      className="flex h-screen flex-row items-start overflow-hidden"
      style={{ backgroundColor: COLOURS.pageBg }}
      data-review-id={reviewId}
    >
      <div
        className="flex h-screen min-h-0 flex-1 flex-col overflow-hidden min-w-0"
      >
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
          primaryActionSlot={<span />}
          onKebab={() => {
            setReviewMenu((m) => (m === 'header' ? null : 'header'));
            setHeaderLifecycleMenuOpen(false);
          }}
          kebabMenu={reviewOptionsMenu}
          kebabMenuExpanded={reviewMenu === 'header'}
          kebabSectionRef={pageKebabSectionRef}
        />

        {tabIndex === 2 ? (
          <main className="flex flex-1 overflow-hidden min-h-0" style={{ backgroundColor: COLOURS.pageBg }}>
            <div className="flex min-h-0 min-w-0 flex-1 overflow-y-auto">
              <ActivityTab reviewId={reviewId} />
            </div>
            <RightColumn
              open={rhcOpen}
              hydrated={rhcHydrated}
              onToggle={toggleRhc}
              feedback={feedbackThreads}
              filteredCards={filteredCards}
              pendingCount={pendingFeedbackCount}
              mode={coreInteractionMode}
              decision={decisionSummary}
              reviewId={reviewId}
              primaryFeedbackCta={primaryFeedbackCta}
              artifacts={artifacts}
              onOpenSubmitFeedbackDrawer={() => setShowFeedbackDrawer(true)}
              onOpenFinalDecisionDrawer={() => setShowFinalDecisionDrawer(true)}
              onSendReminder={handleSendReminder}
              sendingReminder={sendingReminder}
              isReminderRateLimited={isReminderRateLimited}
              canCurrentUserMakeDecision={canCurrentUserMakeDecision}
              currentContributorId={currentContributorId}
              canSubmitFeedback={canSubmitFeedback}
              canEditCoreDetails={canEditCoreDetails}
              allReviewerFeedbackSubmitted={allReviewerFeedbackSubmitted}
              reviewOwnerName={reviewOwnerName}
              totalCardCount={totalCardCount}
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
              changeRequestLabelById={changeRequestLabelById}
              allCardsCount={allCards.length}
              filteredCardsCount={filteredCards.length}
              hasActiveFilters={!isDefaultFilters(activeFilters)}
              repliesByCardId={repliesByCardId}
              reviewType={reviewType}
              currentUserHasNotSubmitted={currentUserHasNotSubmitted}
              reviewStatus={rawStatus}
              reviewClosed={normStatus(rawStatus) === 'complete'}
              comparisonDecisionPromptRowName={comparisonDecisionPromptRowName}
              showComparisonButterPromptDm={showComparisonButterPromptDm}
              showDecisionPromptReadonly={showDecisionPromptReadonly}
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
                    !!(decisionData.text ?? '').trim();
                  if (hasRecordedFinalDecision) return null;
                  const perm = String(currentContributorPermissionLevel ?? '')
                    .trim()
                    .toLowerCase();
                  const ownerTrimmed = String(decisionMakerId ?? '').trim();
                  const matchesDecisionOwner =
                    Boolean(
                      currentContributorId &&
                        ownerTrimmed &&
                        currentContributorId === ownerTrimmed,
                    );
                  const elevatedPermission =
                    perm === 'editor' || perm === 'admin';
                  const showDecisionMakerEmptyState =
                    matchesDecisionOwner || elevatedPermission;
                  return (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="flex h-[478px] w-full max-w-[640px] flex-col items-center justify-center gap-3 rounded-[8px] border border-[#e4ddd3] bg-[#faf8f6] p-6 text-center">
                        {showDecisionMakerEmptyState ? (
                          <>
                            <p className="m-0 text-[16px] font-semibold text-[#2e1c1c]">
                              All feedback is in — ready to record a decision.
                            </p>
                            <Button
                              label="Record Final Decision"
                              variant="primary"
                              size="md"
                              onClick={() => setShowFinalDecisionDrawer(true)}
                            />
                          </>
                        ) : (
                          <>
                            <p className="m-0 text-[16px] font-semibold text-[#2e1c1c]">
                              No decision has been recorded yet.
                            </p>
                            <p className="m-0 max-w-[420px] text-[13px] font-normal text-[#6b5e55]">
                              The decision owner will record the final direction once all feedback has been reviewed.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              {(() => {
                  const ds = normStatus(decisionData.status);
                  const hasRecordedFinalDecision =
                    ds === 'approved' ||
                    ds === 'changes-needed' ||
                    !!(decisionData.text ?? '').trim();
                  if (!hasRecordedFinalDecision) return null;
                  return (
                <div className="flex w-full flex-col gap-3">
                  <div className="flex w-full items-center gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[#998c82]">
                      {decisionData.madeAt
                        ? new Date(decisionData.madeAt).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Decision'}
                    </span>
                    <div className="h-px flex-1 bg-[#e4ddd3]" />
                  </div>
                  <DecisionCard
                    statusPillColor={decisionPillUi.color}
                    statusPillLabel={decisionPillUi.label}
                    options={
                      decisionData.selectedArtifactIds?.map((id) => ({
                        label:
                          artifacts.find((artifact) => artifact.id === id)?.title ??
                          artifacts.find((artifact) => artifact.id === id)?.label ??
                          id,
                      })) ?? []
                    }
                    decisionText={decisionData.text ?? ''}
                    ownerName={decisionAttributionName}
                    recordedAtIso={decisionData.madeAt}
                    showTradeOff={Boolean(decisionData.tradeOffNote)}
                    tradeOffNote={decisionData.tradeOffNote ?? undefined}
                    tradeOffIsAI={decisionData.tradeOffIsAI ?? undefined}
                  />
                </div>
                  );
                })()}
            </div>
          ) : (
          <div
            ref={scrollRootRef}
            className="flex flex-1 flex-row min-w-0 overflow-y-auto pl-8 py-8"
          >
            {/* Left nav (sticky) */}
            <aside
              className="sticky top-0 self-start shrink-0 flex flex-col gap-1 pr-6"
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
            <div className="flex-1 flex flex-col gap-8 pb-8 pr-8 min-w-0">
              {['approved', 'changes-needed', 'needs-changes', 'rejected'].includes(
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
                  authorName={decisionAttributionName}
                  timestamp={
                    decisionData.madeAt
                      ? formatDistanceToNow(new Date(decisionData.madeAt), { addSuffix: true })
                      : undefined
                  }
                  actionLabel="View full decision"
                  onAction={openDecisionLogTab}
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
                    {canEditCoreDetails && !hasFeedbackSubmitted ? (
                      <button
                        type="button"
                        onClick={() => setShowEditTypeModal(true)}
                        style={{
                          border: 'none',
                          background: '#6b1e2e',
                          color: '#ffffff',
                          borderRadius: 999,
                          height: 24,
                          padding: '0 8px 0 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                        }}
                        aria-label="Edit review type"
                      >
                        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>
                          {reviewTypePillLabel}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
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
                        <span style={{ display: 'inline-flex', cursor: 'default' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              height: 24,
                              padding: '0 10px',
                              borderRadius: 999,
                              backgroundColor: '#f5eaec',
                              border: '1px solid #e8d0d4',
                              color: '#6b1e2e',
                            }}
                          >
                            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>
                              {reviewTypePillLabel}
                            </span>
                            <Icon name="info" size={14} />
                          </span>
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </div>
                {coreInteractionMode === 'edit' ? (
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
                      {`Submitted by ${reviewOwnerName?.trim() || 'Review owner'}${formatReviewDetailsDate(reviewCreatedAt) ? `, ${formatReviewDetailsDate(reviewCreatedAt)}` : ''}`}
                    </p>
                  </>
                ) : reviewFocus.trim() ? (
                  <>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: '#2e1c1c',
                        lineHeight: 1.5,
                      }}
                    >
                      {reviewFocus}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#6b5e55' }}>
                      {`Last updated by ${reviewOwnerName?.trim() || 'Review owner'}${formatReviewDetailsDate(reviewCreatedAt) ? `, ${formatReviewDetailsDate(reviewCreatedAt)}` : ''}`}
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
                      {`Submitted by ${reviewOwnerName?.trim() || 'Review owner'}${formatReviewDetailsDate(reviewCreatedAt) ? `, ${formatReviewDetailsDate(reviewCreatedAt)}` : ''}`}
                    </p>
                  </>
                )}
              </section>

              <section id="designs" className="flex flex-col gap-4 scroll-mt-6">
                {artifacts.map((artifact) => (
                  <ArtifactPreview
                    key={artifact.id}
                    size="large"
                    fileType={
                      artifact.type === 'Figma'
                        ? 'figma'
                        : artifact.type === 'PDF'
                          ? 'pdf'
                          : 'jpeg'
                    }
                    mode={coreInteractionMode === 'edit' ? 'editable' : 'readonly'}
                    showDetails
                    fileName={artifact.label}
                    lastEdited="Edited recently"
                    artifactName={artifact.label}
                    iteration={artifact.iteration}
                    description={artifact.description}
                    imageUrl={artifact.imageUrl ?? undefined}
                    linkUrl={artifact.linkUrl ?? undefined}
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
                      )
                    }
                    descriptionAiState={artifact.descriptionAiState ?? 'idle'}
                    persistedAiGenerated={artifact.aiGenerated === true}
                    canGenerateAiDescription={
                      coreInteractionMode === 'edit' &&
                      Boolean(
                        artifact.label.trim() &&
                          (artifact.linkUrl?.trim() ||
                            artifact.imageUrl?.trim() ||
                            artifact.originalFileName?.trim()),
                      )
                    }
                    onRegenerateDescription={
                      coreInteractionMode === 'edit'
                        ? () => void runReviewArtifactDescriptionGeneration(artifact.id)
                        : undefined
                    }
                  />
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
                <div className="flex flex-col gap-2">
                  {problems.map((p) => (
                    <ProblemRow
                      key={p.id}
                      problem={p}
                      mode={coreInteractionMode}
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
                        setProblems((prev) => prev.filter((x) => x.id !== p.id));
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

                {coreInteractionMode === 'edit' && (
                  <div
                    ref={addButtonRef}
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
                        onClick: () => {
                          const toAdd = allProjectProblems.filter((problem) =>
                            selectedFromProject.includes(problem.id)
                          );
                          setProblems((prev) => [
                            ...prev,
                            ...toAdd
                              .filter((candidate) => !prev.some((row) => row.id === candidate.id))
                              .map((candidate) => ({ ...candidate, selected: true })),
                          ]);
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
                    {tradeoffs.map((t) => (
                      <TradeoffCard
                        key={t.id}
                        tradeoff={t}
                        mode={coreInteractionMode}
                        artifacts={artifacts}
                      />
                    ))}
                  </div>
                )}

                {canAddTradeoffs && (
                  <Button
                    label="Add a tradeoff"
                    variant="ghost"
                    size="sm"
                    icon="leading"
                    iconName="plus"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => setTradeoffModalOpen(true)}
                  />
                )}
              </section>

              <section id="reviewers" className="flex flex-col gap-3 scroll-mt-6 pb-24">
                <SectionHeading>Reviewers</SectionHeading>

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
                          onRemove={async () => {
                            const { error } = await removeReviewerAction({
                              reviewId,
                              reviewerContributorId: r.id,
                            });
                            if (error) return;
                            showToast('Changes saved');
                            router.refresh();
                          }}
                        />
                      ))}
                  </div>
                )}

                {coreInteractionMode === 'edit' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      position: 'relative',
                    }}
                    ref={reviewerAnchorRef}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon="leading"
                      iconName="plus"
                      label="Add reviewers"
                      style={{ alignSelf: 'flex-start', flexShrink: 0 }}
                      aria-expanded={reviewerMenuOpen}
                      aria-haspopup="menu"
                      onClick={() => setReviewerMenuOpen((prev) => !prev)}
                    />

                    {reviewerMenuOpen && (
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          maxWidth: 400,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: 0,
                            width: 399,
                            backgroundColor: '#ffffff',
                            border: '1px solid #e4ddd3',
                            borderRadius: 8,
                            boxShadow:
                              '0px 2px 4px rgba(41,33,28,0.06), 0px 8px 16px rgba(41,33,28,0.15)',
                            overflow: 'hidden',
                            zIndex: 50,
                            paddingTop: 4,
                            paddingBottom: 0,
                            marginBottom: 4,
                          }}
                        >
                          <div style={{ paddingBottom: 4 }}>
                            {availableContributors.length === 0 && (
                              <div style={{ padding: '8px 12px', fontSize: 13, color: '#998c82' }}>
                                No teammates found.
                              </div>
                            )}
                            {availableContributors.map((contributor) => {
                              const alreadyReviewer = reviewers.some(
                                (reviewer) => reviewer.id === contributor.id
                              );
                              return (
                                <label
                                  key={contributor.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 12px',
                                    cursor: alreadyReviewer ? 'not-allowed' : 'pointer',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    opacity: alreadyReviewer ? 0.6 : 1,
                                  }}
                                >
                                  <Checkbox
                                    id={`reviewer-${contributor.id}`}
                                    label=""
                                    checked={selectedReviewerIds.includes(contributor.id)}
                                    disabled={alreadyReviewer}
                                    onChange={(checked) => {
                                      if (alreadyReviewer) return;
                                      setSelectedReviewerIds((prev) =>
                                        checked
                                          ? [...prev, contributor.id]
                                          : prev.filter((id) => id !== contributor.id)
                                      );
                                    }}
                                  />
                                  <Avatar name={contributor.name} size="md" />
                                  <span
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 500,
                                      color: '#2e1c1c',
                                      flex: 1,
                                    }}
                                  >
                                    {contributor.name}
                                  </span>
                                  {alreadyReviewer ? (
                                    <span style={{ fontSize: 12, color: '#998c82' }}>
                                      Already a reviewer
                                    </span>
                                  ) : null}
                                </label>
                              );
                            })}
                          </div>

                          <div style={{ height: 1, backgroundColor: '#e4ddd3' }} />

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                            }}
                          >
                            <Button
                              variant="primary"
                              size="sm"
                              label={savingReviewers ? 'Saving' : 'Done'}
                              disabled={savingReviewers}
                              onClick={async () => {
                                if (savingReviewers) return;
                                const toAddFromAll = allSystemContributors.filter((contributor) =>
                                  selectedReviewerIds.includes(contributor.id)
                                );
                                if (toAddFromAll.length === 0) return;
                                setSavingReviewers(true);
                                const { error } = await assignReviewersAction({
                                  reviewId,
                                  reviewerIds: toAddFromAll.map((contributor) => contributor.id),
                                  requireDecisionMaker,
                                });
                                setSavingReviewers(false);
                                if (error) return;
                                showToast('Changes saved');
                                setSelectedReviewerIds([]);
                                setReviewerMenuOpen(false);
                                setReviewerSearch('');
                                router.refresh();
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setReviewerMenuOpen(false);
                                setReviewerModalOpen(true);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 14,
                                fontWeight: 500,
                                color: '#6b1e2e',
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                              }}
                            >
                              <Icon name="plus" size={16} />
                              Create a new teammate
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          placeholder="Find teammates"
                          value={reviewerSearch}
                          onChange={(e) => setReviewerSearch(e.target.value)}
                          autoFocus
                          style={{
                            height: 32,
                            width: '100%',
                            border: '1px solid #6b1e2e',
                            borderRadius: 6,
                            padding: '0 8px',
                            fontSize: 13,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            color: '#2e1c1c',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />

                        {showHelperText && (
                          <p style={{ fontSize: 12, color: '#6b5e55', margin: 0 }}>
                            {helperText}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
          )}

          {/*  Right column: Feedback  */}
          <RightColumn
            open={rhcOpen}
            hydrated={rhcHydrated}
            onToggle={toggleRhc}
            feedback={feedbackThreads}
            filteredCards={filteredCards}
            pendingCount={pendingFeedbackCount}
            mode={coreInteractionMode}
            decision={decisionSummary}
            reviewId={reviewId}
            primaryFeedbackCta={primaryFeedbackCta}
            artifacts={artifacts}
            onOpenSubmitFeedbackDrawer={() => setShowFeedbackDrawer(true)}
            onOpenFinalDecisionDrawer={() => setShowFinalDecisionDrawer(true)}
            onSendReminder={handleSendReminder}
            sendingReminder={sendingReminder}
            isReminderRateLimited={isReminderRateLimited}
            canCurrentUserMakeDecision={canCurrentUserMakeDecision}
            currentContributorId={currentContributorId}
            canSubmitFeedback={canSubmitFeedback}
            canEditCoreDetails={canEditCoreDetails}
            allReviewerFeedbackSubmitted={allReviewerFeedbackSubmitted}
            reviewOwnerName={reviewOwnerName}
            totalCardCount={totalCardCount}
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
            changeRequestLabelById={changeRequestLabelById}
            allCardsCount={allCards.length}
            filteredCardsCount={filteredCards.length}
            hasActiveFilters={!isDefaultFilters(activeFilters)}
            repliesByCardId={repliesByCardId}
            reviewType={reviewType}
            currentUserHasNotSubmitted={currentUserHasNotSubmitted}
            reviewStatus={rawStatus}
            reviewClosed={normStatus(rawStatus) === 'complete'}
            comparisonDecisionPromptRowName={comparisonDecisionPromptRowName}
            showComparisonButterPromptDm={showComparisonButterPromptDm}
            showDecisionPromptReadonly={showDecisionPromptReadonly}
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
          reviewClosed={normStatus(rawStatus) === 'complete'}
          existingFeedbackDraft={currentUserFeedbackDraft}
          currentContributorId={currentContributorId}
          onClose={() => setShowFeedbackDrawer(false)}
          onSubmitSuccess={() => {
            setShowFeedbackDrawer(false);
            const msg = currentUserFeedbackDraft
              ? 'Feedback updated successfully'
              : 'Feedback submitted successfully';
            setFeedbackSubmitToast(msg);
            window.setTimeout(() => {
              setFeedbackSubmitToast((prev) => (prev === msg ? null : prev));
            }, 3000);
            router.refresh();
          }}
        />
      )}
      {showFinalDecisionDrawer ? (
        <FinalDecisionDrawer
          open={showFinalDecisionDrawer}
          onClose={() => setShowFinalDecisionDrawer(false)}
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
            title: artifact.title ?? artifact.label,
            iterationLabel: artifact.iteration,
          }))}
          currentContributorId={currentContributorId}
          onDecisionSubmitted={() => {
            router.refresh();
          }}
        />
      ) : null}
      {feedbackSubmitToast || reviewDetailsSaveErrorToast ? (
        <div
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            background: reviewDetailsSaveErrorToast ? '#fceaea' : '#ebf6ee',
            border: reviewDetailsSaveErrorToast ? '1px solid #e07070' : '1px solid #7dc98f',
            color: reviewDetailsSaveErrorToast ? '#8a1f1f' : '#256b38',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            zIndex: 1200,
          }}
          role="status"
          aria-live="polite"
        >
          {feedbackSubmitToast ?? reviewDetailsSaveErrorToast}
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
            showToast('Changes saved');
          }}
        />
      ) : null}

      <EditReviewDrawer
        open={editReviewDrawerOpen}
        onClose={() => setEditReviewDrawerOpen(false)}
        reviewId={reviewId}
        initialTitle={title}
        initialReviewFocus={reviewFocus}
        onSaved={() => router.refresh()}
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
                    setProblems((prev) =>
                      prev.map((problem) =>
                        problem.id === editingProblem.id ? { ...problem, text } : problem
                      )
                    );
                    if (includeInProject) {
                      setAllProjectProblems((prev) =>
                        prev.some((problem) => problem.id === editingProblem.id)
                          ? prev.map((problem) =>
                              problem.id === editingProblem.id ? { ...problem, text } : problem
                            )
                          : [...prev, { ...editingProblem, text }]
                      );
                    }
                  } else {
                    const next: Problem = {
                      id: crypto.randomUUID(),
                      text,
                      selected: true,
                    };
                    setProblems((prev) => [...prev, next]);
                    if (includeInProject) {
                      setAllProjectProblems((prev) => [...prev, next]);
                      if (projectId) {
                        const supabase = createSupabaseBrowserClient();
                        await supabase.from('problems').insert({
                          id: next.id,
                          project_id: projectId,
                          description: next.text,
                        });
                      }
                    }
                  }
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
        title="Create a tradeoff"
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
                variant="accent"
                size="sm"
                label="Create"
                onClick={() => {
                  const text = newTradeoffText.trim();
                  if (!text) return;
                  setTradeoffs((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      label: text,
                      severity: newTradeoffSeverity,
                      relatedArtifactIds: [...tradeoffSelectedArtifactIds],
                    },
                  ]);
                  closeTradeoffModal();
                }}
              />
            ) : (
              <Tooltip label="Add a description to continue">
                <span style={{ display: 'inline-flex' }}>
                  <Button variant="accent" size="sm" label="Create" disabled aria-disabled />
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
            {tradeoffSelectedArtifactIds.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tradeoffSelectedArtifactIds.map((artifactId) => {
                  const art = artifacts.find((a) => a.id === artifactId);
                  const title =
                    (art?.title ?? art?.label ?? art?.originalFileName ?? '')
                      .trim() || 'Artifact';
                  return (
                    <div
                      key={artifactId}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        height: 40,
                        padding: '4px 12px',
                        borderRadius: 4,
                        backgroundColor: '#f3efe9',
                        border: '1px solid #e4ddd3',
                        boxSizing: 'border-box',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#2e1c1c',
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
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
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 16,
                          lineHeight: 1,
                          color: '#6b5e55',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {artifacts.some(
              (a) => !tradeoffSelectedArtifactIds.includes(a.id),
            ) ? (
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
                      (a.title ?? a.label ?? a.originalFileName ?? '').trim() ||
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
                if (!projectId.trim()) return;
                setIsCreatingTeammate(true);

                if (includeInTeam && email) {
                  const supabase = createSupabaseBrowserClient();
                  const activeWorkspaceId = await getActiveWorkspaceId(supabase);
                  if (activeWorkspaceId) {
                    const inviteResult = await sendWorkspaceInvite({
                      workspace_id: activeWorkspaceId,
                      email,
                      name,
                      role: 'viewer',
                    });
                    if (inviteResult.status === 'error') {
                      setIsCreatingTeammate(false);
                      showToast(inviteToastMessage(inviteResult, name, email));
                      return;
                    }
                    showToast(inviteToastMessage(inviteResult, name, email));
                  }
                }

                const { error } = await createTeammateFromReviewAction({
                  reviewId,
                  projectId,
                  name,
                  email: email || null,
                  role: newReviewerRole.trim() || 'Stakeholder',
                  requireDecisionMaker,
                  includeInWorkspace: includeInTeam,
                });
                setIsCreatingTeammate(false);
                if (error) return;
                if (!includeInTeam || !email) {
                  showToast('Changes saved');
                }
                closeReviewerModal();
                router.refresh();
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
        fontWeight: 600,
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
        height: 40,
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
      <span
        className="flex-1 min-w-0 truncate"
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

function tradeoffDrawerSentimentStyle(severity: 'High' | 'Medium' | 'Low'): {
  bg: string;
  border: string;
  pillBg: string;
  pillFg: string;
} {
  if (severity === 'High') {
    return {
      bg: '#fceaea',
      border: '#e07070',
      pillBg: '#c94040',
      pillFg: '#ffffff',
    };
  }
  if (severity === 'Medium') {
    return {
      bg: '#fef8dc',
      border: '#e5b025',
      pillBg: '#e0b530',
      pillFg: '#3d2800',
    };
  }
  return {
    bg: '#f3efe9',
    border: '#e4ddd3',
    pillBg: '#6b1e2e',
    pillFg: '#ffffff',
  };
}

//  Tradeoff sentiment card 

function TradeoffCard({
  tradeoff,
  mode,
  artifacts,
}: {
  tradeoff: Tradeoff;
  mode: ReviewMode;
  artifacts: ReviewArtifact[];
}) {
  const sentiment = tradeoffDrawerSentimentStyle(tradeoff.severity);

  const relatedArtifactLine =
    tradeoff.relatedArtifactIds && tradeoff.relatedArtifactIds.length > 0
      ? tradeoff.relatedArtifactIds
          .map((id) => {
            const a = artifacts.find((x) => x.id === id);
            return (
              (a?.title ?? a?.label ?? a?.originalFileName ?? '').trim() || id
            );
          })
          .filter(Boolean)
          .join(' · ')
      : '';

  return (
    <div
      className="flex items-center w-full"
      style={{
        borderRadius: 6,
        backgroundColor: sentiment.bg,
        border: `1px solid ${sentiment.border}`,
        paddingLeft: 12,
        paddingRight: 8,
        paddingTop: 4,
        paddingBottom: 4,
        gap: 12,
        minWidth: 0,
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="min-w-0 truncate"
          style={{ fontSize: 13, color: '#2e1c1c', fontWeight: 400 }}
        >
          {tradeoff.label}
        </span>
        {relatedArtifactLine ? (
          <span
            className="min-w-0 truncate"
            style={{
              fontSize: 12,
              fontWeight: 400,
              lineHeight: 1.5,
              letterSpacing: 0.24,
              color: '#998c82',
            }}
          >
            {relatedArtifactLine}
          </span>
        ) : null}
      </div>

      <div
        className="flex shrink-0 items-center gap-1.5"
        style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 20,
            padding: '0 8px',
            borderRadius: 9999,
            backgroundColor: sentiment.pillBg,
            color: sentiment.pillFg,
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.5,
            letterSpacing: 0.22,
            whiteSpace: 'nowrap',
          }}
        >
          {tradeoff.severity}
        </span>
        {tradeoff.artifactLabel ? (
          <Tag label={tradeoff.artifactLabel} variant="neutral" size="sm" />
        ) : null}
      </div>

      {mode === 'edit' && (
        <button
          type="button"
          aria-label={`More options for ${tradeoff.label}`}
          className="inline-flex items-center justify-center shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            color: '#6b5e55',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Icon name="kebab" size={14} />
        </button>
      )}
    </div>
  );
}

//  Reviewer chip 

function ReviewerChip({
  reviewer,
  mode,
  onRemove,
}: {
  reviewer: Reviewer;
  mode: ReviewMode;
  onRemove: () => void | Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  const isLilac = reviewer.variant === 'lilac';
  const isEdit = mode === 'edit';
  const isHovered = isEdit && hovered;

  // Hover tones from the Contributors pattern on Project Detail. Decision
  // makers (lilac) get a stronger lilac; default chips darken into the warm
  // neutral ramp.
  const bg = isHovered
    ? isLilac
      ? '#f0e2f1'
      : '#ede8e0'
    : isLilac
      ? '#f5e8f6'
      : '#f3efe9';
  const borderCol = isHovered
    ? isLilac
      ? '#c490c8'
      : '#c9c0b4'
    : isLilac
      ? '#d9a8dc'
      : '#e4ddd3';

  return (
    <span
      className="inline-flex items-center"
      onMouseEnter={() => isEdit && setHovered(true)}
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
      <Avatar name={reviewer.name} size="md" />
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
        </>
      )}
    </span>
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

function deriveFeedbackStage(
  feedback: FeedbackThread[],
  decisionMade: boolean,
): FeedbackStage {
  if (decisionMade) return 4;
  if (feedback.length === 0) return 1;
  const allSubmitted = feedback.every((t) => t.status === 'submitted');
  if (allSubmitted) return 3;
  return 2;
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 64)}px`;
    el.style.overflowY = el.scrollHeight > 64 ? 'auto' : 'hidden';
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!value.trim()) return;
      onSend();
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <textarea
        ref={textareaRef}
        rows={1}
        maxLength={140}
        placeholder="Reply..."
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 140))}
        onKeyDown={handleKeyDown}
        className="placeholder:text-[#998c82]"
        style={{
          flex: 1,
          resize: 'none',
          overflow: 'hidden',
          minHeight: 32,
          maxHeight: 64,
          border: '1px solid #e4ddd3',
          borderRadius: 6,
          padding: '6px 8px',
          fontSize: 13,
          color: '#2e1c1c',
          background: '#ffffff',
          fontFamily: 'inherit',
        }}
        aria-label="Write a reply"
      />
      <button
        type="button"
        style={{
          height: 32,
          padding: '0 12px',
          border: '1px solid #e4ddd3',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          color: '#2e1c1c',
          background: '#ffffff',
          opacity: value.trim() ? 1 : 0.6,
          cursor: value.trim() ? 'pointer' : 'not-allowed',
        }}
        disabled={!value.trim()}
        onClick={() => {
          onSend();
        }}
      >
        Send
      </button>
    </div>
  );
}

function RightColumn({
  open,
  hydrated,
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
  canCurrentUserMakeDecision,
  currentContributorId,
  canSubmitFeedback,
  canEditCoreDetails,
  allReviewerFeedbackSubmitted,
  reviewOwnerName,
  totalCardCount,
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
}: {
  open: boolean;
  hydrated: boolean;
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
  onOpenSubmitFeedbackDrawer: () => void;
  onOpenFinalDecisionDrawer: () => void;
  onSendReminder: () => Promise<boolean>;
  sendingReminder: boolean;
  isReminderRateLimited: boolean;
  canCurrentUserMakeDecision: boolean;
  currentContributorId: string | null;
  canSubmitFeedback: boolean;
  canEditCoreDetails: boolean;
  allReviewerFeedbackSubmitted: boolean;
  reviewOwnerName: string | null;
  totalCardCount: number;
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
}) {
  const width = open ? 'clamp(360px, 34vw, 440px)' : RHC_CLOSED_WIDTH;
  const decisionMade = decision !== null;
  const stage = deriveFeedbackStage(feedback, decisionMade);
  const reminderDisabled =
    allReviewerFeedbackSubmitted ||
    sendingReminder ||
    reviewClosed ||
    isReminderRateLimited;
  const [reminderJustSent, setReminderJustSent] = useState(false);
  const filterAnchorRef = useRef<HTMLDivElement | null>(null);

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
    onOpenFinalDecisionDrawer();
  };
  const rawRt = reviewType.trim().toLowerCase();
  const normalizedReviewType =
    rawRt === 'comparison'
      ? 'compare'
      : rawRt === 'approval'
        ? 'approve'
        : rawRt === 'alignment'
          ? 'align'
          : rawRt;
  const hideAddFeedbackForCompareOrApprove =
    normalizedReviewType === 'compare' || normalizedReviewType === 'approve';
  const hasFiltersRow = hasActiveFilters;
  const hasSubmitFeedbackCta = canSubmitFeedback;
  const hasDecisionCta = primaryFeedbackCta?.type === 'make-decision';
  const hasTagsAndCtaGroup = hasFiltersRow || hasSubmitFeedbackCta || hasDecisionCta;
  const submitFeedbackLabel =
    primaryFeedbackCta?.type === 'submit-feedback'
      ? primaryFeedbackCta.label
      : 'Submit Feedback';

  return (
    <aside
      className="hidden lg:flex shrink-0 flex-col h-full overflow-hidden"
      style={{
        width,
        minWidth: open ? 360 : RHC_CLOSED_WIDTH,
        maxWidth: open ? 440 : RHC_CLOSED_WIDTH,
        backgroundColor: COLOURS.surfaceCard,
        borderLeft: `1px solid ${COLOURS.borderDefault}`,
        transition: hydrated ? 'width 200ms ease-in-out' : 'none',
      }}
      aria-label="Feedback"
      data-review-id={reviewId}
      data-feedback-stage={stage}
    >
      {open ? (
        <div className="flex h-full flex-col">
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
            <div className="flex w-full flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <h2
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: COLOURS.textHeading,
                      margin: 0,
                    }}
                  >
                    Feedback
                  </h2>
                  {totalCardCount > 0 &&
                    (hasActiveFilters ? (
                      <span
                        className={`${notificationBadgeStyles.badge} ${notificationBadgeStyles['badge-brand']}`}
                        role="status"
                        aria-label={`${filteredCardsCount} of ${allCardsCount} cards shown`}
                        style={{ textTransform: 'none', letterSpacing: '0.02em' }}
                      >
                        {`${filteredCardsCount} of ${allCardsCount}`}
                      </span>
                    ) : (
                      <NotificationBadge
                        variant="number"
                        sentiment="brand"
                        count={totalCardCount}
                      />
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  {canEditCoreDetails && (
                    <Tooltip
                      label={
                        reminderJustSent
                          ? 'Reminder sent'
                          : isReminderRateLimited
                            ? 'Reminder already sent today'
                            : reviewClosed
                              ? 'This review has been closed'
                              : reminderDisabled && !sendingReminder
                                ? 'All reviewers have submitted feedback'
                                : 'Send reminder to pending reviewers'
                      }
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
                      style={filterButtonStyle}
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
                  {canSubmitFeedback && !hideAddFeedbackForCompareOrApprove ? (
                    currentUserHasNotSubmitted ? (
                      <Tooltip
                        label={reviewClosed ? 'This review has been closed' : 'Add feedback'}
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
                            onClick={reviewClosed ? undefined : onOpenSubmitFeedbackDrawer}
                          />
                        </span>
                      </Tooltip>
                    ) : (
                      <Tooltip
                        label={reviewClosed ? 'This review has been closed' : 'Edit feedback'}
                        position="bottom"
                      >
                        <span style={{ display: 'inline-flex' }}>
                          <Button
                            type="button"
                            label="Edit feedback"
                            aria-label="Edit feedback"
                            variant="secondary"
                            size="sm"
                            style={headerIconDimmedStyle}
                            disabled={reviewClosed}
                            onClick={reviewClosed ? undefined : onOpenSubmitFeedbackDrawer}
                          />
                        </span>
                      </Tooltip>
                    )
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

              {hasTagsAndCtaGroup ? (
                <div className="flex flex-col gap-6">
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

                  {hasSubmitFeedbackCta && (() => {
                    const submitted = !currentUserHasNotSubmitted;
                    const isComparison = normalizedReviewType === 'compare';

                    if (reviewClosed) {
                      return (
                        <Tooltip label="The decision has been recorded for this review.">
                          <span className="inline-flex w-full">
                            <Button
                              variant="primary"
                              size="md"
                              label={submitFeedbackLabel}
                              className="w-full"
                              disabled
                              aria-disabled
                            />
                          </span>
                        </Tooltip>
                      );
                    }

                    if (isComparison && submitted) {
                      return (
                        <Tooltip label="You've already submitted feedback for this review">
                          <span className="inline-flex w-full">
                            <Button
                              variant="primary"
                              size="md"
                              label="Submit Feedback"
                              className="w-full"
                              disabled
                              aria-disabled
                            />
                          </span>
                        </Tooltip>
                      );
                    }

                    if (!isComparison && submitted) {
                      return (
                        <Button
                          variant="secondary"
                          size="md"
                          label="Add another feedback"
                          aria-label="Add another feedback"
                          icon="leading"
                          iconOnly
                          iconName="plus"
                          className="w-full"
                          onClick={onOpenSubmitFeedbackDrawer}
                        />
                      );
                    }

                    return (
                      <Button
                        variant="primary"
                        size="md"
                        label={submitFeedbackLabel}
                        className="w-full"
                        onClick={onOpenSubmitFeedbackDrawer}
                      />
                    );
                  })()}
                  {hasDecisionCta && (
                    <Button
                      variant="primary"
                      size="md"
                      label={primaryFeedbackCta.label}
                      className="w-full"
                      disabled={!canCurrentUserMakeDecision}
                      onClick={handleMakeDecision}
                    />
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col px-6">
            {showComparisonButterPromptDm && comparisonDecisionPromptRowName ? (
              <div
                className="flex flex-col rounded-[8px] border bg-[var(--feedback/warning/bg,#fef8dc)]"
                style={{
                  borderColor: 'var(--feedback/warning/border,#e5b025)',
                  padding: '12px 16px',
                  gap: 10,
                }}
              >
                <div className="flex items-center gap-2">
                  <Avatar name={comparisonDecisionPromptRowName} size="md" />
                  <span
                    className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-[#2e1c1c]"
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  >
                    {comparisonDecisionPromptRowName}
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-medium leading-tight text-[var(--feedback/warning/text,#7a5500)]"
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  >
                    Decision Required
                  </span>
                  <Icon
                    name="status-blocked"
                    size={16}
                    style={{ color: 'var(--feedback/warning/text,#7a5500)', flexShrink: 0 }}
                  />
                </div>
                <Button
                  variant="primary"
                  size="md"
                  label="Add Decision"
                  className="w-full"
                  onClick={onOpenFinalDecisionDrawer}
                />
              </div>
            ) : null}
            {showDecisionPromptReadonly ? (
              <div className="rounded-[8px] border border-[#e5b025] bg-[#fef8dc] px-4 py-3">
                <p className="m-0 text-[13px] font-medium text-[#6b5e55]">
                  Awaiting final decision.
                </p>
              </div>
            ) : null}
            {(showComparisonButterPromptDm || showDecisionPromptReadonly) &&
            reviewStatus === 'feedback-submitted' ? (
              <div className="py-4">
                <div className="h-px w-full bg-[#e4ddd3]" />
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {stage === 1 && (
                <div style={{ fontSize: 13, color: '#6b5e55' }}>
                  No reviewers assigned yet.
                </div>
              )}
            </div>

            <div
              style={{
                marginTop:
                  stage === 1 || (stage === 2 && feedback.length > 0 && pendingCount === feedback.length)
                    ? 24
                    : 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {filteredCards.map((card) => {
                if (card.cardType === 'feedback' || card.cardType === 'notification') {
                  const thread = card.thread;
                  const threadReplies = repliesByCardId.get(thread.id) ?? [];
                  const type = getCommentType(thread, threadReplies.length > 0);
                  return (
                    <CommentThread
                      key={thread.id}
                      type={type}
                      cardCategory={card.cardType === 'notification' ? 'notification' : 'feedback'}
                      isStakeholder={
                        Boolean(currentContributorId) &&
                        canCurrentUserMakeDecision &&
                        thread.reviewerId === currentContributorId
                      }
                      authorName={thread.author}
                      authorAvatarSrc={thread.authorAvatarSrc}
                      timestamp={thread.timestamp !== '' ? thread.timestamp : undefined}
                      body={thread.text}
                      options={thread.optionTag ? [{ label: thread.optionTag }] : []}
                      replies={threadReplies.map((reply) => {
                        const authorName = reply.reply_by_id
                          ? contributorsById.get(reply.reply_by_id)?.name ?? 'Reviewer'
                          : 'Reviewer';
                        return {
                          text: reply.reply_text,
                          authorName,
                          authorInitials: initialsFromName(authorName),
                          timestamp: formatDistanceToNow(new Date(reply.created_at), {
                            addSuffix: true,
                          }),
                        };
                      })}
                      onReply={
                      thread.status === 'submitted'
                          ? (text) => void onFeedbackReply(thread.id, text)
                          : undefined
                      }
                      onMakeDecision={handleMakeDecision}
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

                const request = card.changeRequest;
                const reviewer = request.reviewer_id ? reviewersById.get(request.reviewer_id) : null;
                const reviewerName = reviewer?.name ?? 'Reviewer';
                const reviewerInitials = initialsFromName(reviewerName);
                const changeRequestLabel =
                  changeRequestLabelById.get(request.id) ?? '0.0';
                const createdAtLabel = request.created_at
                  ? formatDistanceToNow(new Date(request.created_at), { addSuffix: true })
                  : '';
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
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          background: '#f5eaec',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#6b1e2e',
                          textTransform: 'uppercase',
                          flexShrink: 0,
                        }}
                      >
                        {reviewerInitials}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#2e1c1c' }}>
                        {reviewerName}
                      </span>
                      <span style={{ fontSize: 12, color: '#998c82' }}> </span>
                      <span style={{ flex: 1, fontSize: 12, color: '#998c82' }}>{createdAtLabel}</span>
                      <div
                        style={{
                          background: '#fef8dc',
                          border: '1.5px solid #e5b025',
                          borderRadius: 4,
                          padding: '2px 10px',
                          fontSize: 12,
                          color: '#7a5500',
                        }}
                      >
                        {`Change ${changeRequestLabel}`}
                      </div>
                    </div>

                    {request.changes_needed ? (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          color: '#2e1c1c',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        }}
                      >
                        {request.changes_needed}
                      </p>
                    ) : null}

                    {request.artifact_ids.length > 0 ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {request.artifact_ids.map((artifactId) => {
                          const idNorm = String(artifactId).trim();
                          const artifact = artifacts.find(
                            (item) =>
                              item.title != null &&
                              String(item.title).trim() === idNorm
                          );
                          const tagText = artifact?.title?.trim() ?? '';
                          if (!tagText) return null;
                          return (
                            <div
                              key={artifactId}
                              style={{
                                background: '#f5eaec',
                                border: '1px solid #e8d0d4',
                                borderRadius: 4,
                                padding: '2px 8px',
                                fontSize: 12,
                                color: '#6b1e2e',
                              }}
                            >
                              {tagText}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {crReplies.map((reply) => (
                      <div
                        key={reply.id}
                        className="flex gap-[10px] items-start rounded-[4px] bg-[#f3efe9] p-3"
                      >
                        <span className="shrink-0 text-[#998c82]">
                          <Icon name="drill-down" size={16} />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p className="break-words text-[14px] text-[#2e1c1c]">{reply.reply_text}</p>
                          <div className="flex items-center gap-2 text-[12px] text-[#998c82]">
                            <span>
                              {reply.reply_by_id
                                ? contributorsById.get(reply.reply_by_id)?.name ?? 'Reviewer'
                                : 'Reviewer'}
                            </span>
                            <span> </span>
                            <span>
                              {formatDistanceToNow(new Date(reply.created_at), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}

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
                  </div>
                );
              })}
            {(normalizedReviewType === 'approve' || normalizedReviewType === 'compare') &&
              stage === 3 &&
              !reviewClosed && (
              <div style={{ fontSize: 13, color: '#6b5e55' }}>
                All feedback is in. A decision is now required.
              </div>
              )}

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
            onClick={onToggle}
          />
        </div>
      )}
    </aside>
  );
}
