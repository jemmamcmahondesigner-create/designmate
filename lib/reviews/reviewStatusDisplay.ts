import {
  resolveStatusPillDisplay,
  type StatusPillColor,
} from '@/components/ui/ds/StatusPill';
import type { ReviewDbStatus } from '@/types/review';

/** Statuses from which Complete is reachable (resolved states). */
export const COMPLETABLE_STATUSES = [
  'approved',
  'direction-approved',
  'needs-changes',
  'feedback-submitted',
] as const;

export type ManualReviewStatusOption = { value: string; label: string };

export const STATUS_DISPLAY_LABELS: Record<string, string> = {
  draft: 'Draft',
  'in-review': 'In Review',
  'needs-changes': 'Needs Changes',
  'feedback-submitted': 'Feedback Submitted',
  approved: 'Approved',
  'direction-approved': 'Direction Approved',
  paused: 'Paused',
  complete: 'Complete',
};

export function normalizeReviewStatusKey(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

const REVIEW_DB_STATUSES = [
  'draft',
  'in-review',
  'feedback-submitted',
  'paused',
  'complete',
  'approved',
  'direction-approved',
  'needs-changes',
  'changes-needed',
  'blocked',
] as const satisfies readonly ReviewDbStatus[];

/** Normalize persisted `reviews.status` for cards, lists, and detail views. */
export function parseReviewDbStatus(
  raw: string | null | undefined,
): ReviewDbStatus {
  const key = normalizeReviewStatusKey(raw);
  if ((REVIEW_DB_STATUSES as readonly string[]).includes(key)) {
    return key as ReviewDbStatus;
  }
  return 'in-review';
}

export function normalizeReviewTypeKey(raw: string | null | undefined): string {
  const rt = normalizeReviewStatusKey(raw);
  if (rt === 'comparison') return 'compare';
  if (rt === 'approval') return 'approve';
  if (rt === 'alignment') return 'align';
  return rt;
}

function isCompleteLifecycle(
  raw: string,
  reviewTypeNorm?: string,
): boolean {
  const k = normalizeReviewStatusKey(raw);
  const rtNorm = normalizeReviewTypeKey(reviewTypeNorm ?? '');
  if (k === 'complete') return true;
  if (rtNorm === 'compare') return false;
  return k === 'approved';
}

function completeLifecyclePillColor(
  decisionStatus: string | null | undefined,
): StatusPillColor {
  const s = normalizeReviewStatusKey(decisionStatus);
  if (!s) return 'mushroom';
  if (s === 'approved') return 'green';
  if (s === 'rejected' || s === 'blocked') return 'error';
  if (s === 'needs-changes' || s === 'changes-needed') return 'brand';
  return 'mushroom';
}

export type ReviewStatusPillDisplay = {
  label: string;
  color: StatusPillColor;
  tooltip?: string;
};

/** Shared review lifecycle status → pill label/colour (list cards + detail header). */
export function resolveReviewStatusPill(args: {
  status: string;
  reviewType?: string | null;
  decisionStatus?: string | null;
  openChangeRequestCount?: number;
}): ReviewStatusPillDisplay {
  const k = normalizeReviewStatusKey(args.status);
  const rtNorm = normalizeReviewTypeKey(args.reviewType ?? '');
  const openCr = args.openChangeRequestCount ?? 0;
  const decisionK = normalizeReviewStatusKey(args.decisionStatus);

  if (rtNorm === 'compare') {
    const directionApprovedLifecycle =
      k === 'approved' ||
      k === 'direction-approved' ||
      k === 'complete';
    const directionApprovedByDecision =
      (decisionK === 'approved' || decisionK === 'changes-needed') &&
      (k === 'in-review' || k === 'feedback-submitted');

    if (directionApprovedLifecycle || directionApprovedByDecision) {
      if (k === 'complete') {
        return {
          label: 'COMPLETE',
          color: openCr > 0 ? 'brand' : 'green',
          tooltip: openCr > 0 ? 'Change requests remain open' : undefined,
        };
      }
      const hasOpen = openCr > 0;
      return {
        label: 'DIRECTION APPROVED',
        color: hasOpen ? 'brand' : 'green',
        tooltip: hasOpen ? 'Changes are still open on this review' : undefined,
      };
    }

    if (openCr > 0 && (k === 'feedback-submitted' || k === 'in-review')) {
      return { label: STATUS_DISPLAY_LABELS['needs-changes'], color: 'brand' };
    }
  }

  if (rtNorm === 'approve') {
    if (k === 'approved') {
      return { label: 'Approved', color: 'green' };
    }
    if (openCr > 0 && (k === 'feedback-submitted' || k === 'in-review')) {
      return { label: STATUS_DISPLAY_LABELS['needs-changes'], color: 'brand' };
    }
  }

  const basicPill = resolveStatusPillDisplay(k);
  if (basicPill && (k === 'needs-changes' || k === 'changes-needed')) {
    return basicPill;
  }

  if (k === 'draft') return { label: 'Draft', color: 'mushroom' };
  if (k === 'in-review') return { label: 'In Review', color: 'butter' };
  if (k === 'feedback-submitted') {
    return resolveStatusPillDisplay(k) ?? { label: 'Feedback Submitted', color: 'blue' };
  }
  if (k === 'paused') {
    return resolveStatusPillDisplay(k) ?? { label: 'Paused', color: 'mushroom' };
  }
  if (k === 'direction-approved') {
    return resolveStatusPillDisplay(k) ?? { label: 'Direction Approved', color: 'green' };
  }
  if (k === 'approved') return { label: 'Approved', color: 'green' };
  if (k === 'complete') {
    const hasOpen = (args.openChangeRequestCount ?? 0) > 0;
    return {
      label: rtNorm === 'compare' ? 'COMPLETE' : STATUS_DISPLAY_LABELS.complete,
      color: hasOpen ? 'brand' : 'green',
      tooltip: hasOpen ? 'Change requests remain open' : undefined,
    };
  }
  if (isCompleteLifecycle(args.status, args.reviewType ?? undefined)) {
    return {
      label: 'Complete',
      color: completeLifecyclePillColor(args.decisionStatus),
    };
  }
  if (k === 'blocked') return { label: 'Blocked', color: 'error' };
  if (k === 'closed') return { label: 'Closed', color: 'mushroom' };
  if (k === 'archived') return { label: 'Archived', color: 'mushroom' };
  return { label: 'Draft', color: 'mushroom' };
}

export type ReviewCardSortInput = {
  status: string;
  reviewType?: string | null;
  decisionStatus?: string | null;
  changeRequestCount?: number;
};

/**
 * Project sidebar review list order (lower = higher):
 * changes needed → in review → draft → paused → completed/resolved.
 */
export function resolveReviewCardSortRank(input: ReviewCardSortInput): number {
  const k = normalizeReviewStatusKey(input.status);
  const rtNorm = normalizeReviewTypeKey(input.reviewType ?? '');
  const openCr = input.changeRequestCount ?? 0;
  const decisionK = normalizeReviewStatusKey(input.decisionStatus);

  const changesNeededRank = 0;
  const inReviewRank = 1;
  const draftRank = 2;
  const pausedRank = 3;
  const completedRank = 4;

  if (k === 'complete' || k === 'archived' || k === 'closed') {
    return completedRank;
  }

  if (rtNorm === 'compare') {
    const directionApproved =
      k === 'approved' ||
      k === 'direction-approved' ||
      ((decisionK === 'approved' || decisionK === 'changes-needed') &&
        (k === 'in-review' || k === 'feedback-submitted'));
    if (directionApproved) return completedRank;

    if (openCr > 0 && (k === 'in-review' || k === 'feedback-submitted')) {
      return changesNeededRank;
    }
  }

  if (rtNorm === 'approve') {
    if (k === 'approved') return completedRank;
    if (openCr > 0 && (k === 'feedback-submitted' || k === 'in-review')) {
      return changesNeededRank;
    }
  }

  if (k === 'needs-changes' || k === 'changes-needed' || k === 'blocked') {
    return changesNeededRank;
  }

  if (k === 'in-review' || k === 'feedback-submitted') return inReviewRank;
  if (k === 'draft') return draftRank;
  if (k === 'paused') return pausedRank;
  if (k === 'approved' || k === 'direction-approved') return completedRank;

  return inReviewRank;
}

type ReviewCardSortable = ReviewCardSortInput & {
  dateTooltipIso?: string | null;
  sortTimestamp?: string | null;
};

function reviewCardSortTimestamp(item: ReviewCardSortable): number {
  const raw = item.sortTimestamp ?? item.dateTooltipIso ?? null;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Compare two project sidebar review cards (status rank, then newest first). */
export function compareReviewCardsBySidebarOrder(
  a: ReviewCardSortable,
  b: ReviewCardSortable,
): number {
  const rankDiff = resolveReviewCardSortRank(a) - resolveReviewCardSortRank(b);
  if (rankDiff !== 0) return rankDiff;
  return reviewCardSortTimestamp(b) - reviewCardSortTimestamp(a);
}

/** Sort project sidebar review cards by lifecycle priority. */
export function sortReviewCardsForProjectSidebar<T extends ReviewCardSortable>(
  reviews: T[],
): T[] {
  return [...reviews].sort(compareReviewCardsBySidebarOrder);
}

function isCompletableStatusKey(statusKey: string): boolean {
  if (statusKey === 'changes-needed') return true;
  return (COMPLETABLE_STATUSES as readonly string[]).includes(statusKey);
}

/** Review has reached a resolved state where the creator can close it. */
export function isResolvedReviewStatus(status: string | null | undefined): boolean {
  return isCompletableStatusKey(normalizeReviewStatusKey(status));
}

/** Review is fully terminal. */
export function isCompleteReviewStatus(status: string | null | undefined): boolean {
  return normalizeReviewStatusKey(status) === 'complete';
}

/** Status to restore when reopening a complete review. */
export function reopenReviewStatusForType(reviewType: string | null | undefined): string {
  const rt = normalizeReviewTypeKey(reviewType ?? '');
  if (rt === 'compare' || rt === 'approve') return 'approved';
  return 'feedback-submitted';
}

/** Pill dropdown / manual lifecycle menu options for the current review status. */
export function manualReviewStatusMenuOptions(
  currentStatus: string | null | undefined,
): ManualReviewStatusOption[] {
  const k = normalizeReviewStatusKey(currentStatus);

  if (k === 'draft' || k === 'complete') {
    return [];
  }

  if (k === 'paused') {
    return [{ value: 'in-review', label: STATUS_DISPLAY_LABELS['in-review'] }];
  }

  if (k === 'in-review') {
    return [{ value: 'paused', label: STATUS_DISPLAY_LABELS.paused }];
  }

  if (isCompletableStatusKey(k)) {
    return [
      { value: 'paused', label: STATUS_DISPLAY_LABELS.paused },
      { value: 'complete', label: STATUS_DISPLAY_LABELS.complete },
    ];
  }

  return [];
}
