import {
  resolveStatusPillDisplay,
  type StatusPillColor,
} from '@/components/ui/ds/StatusPill';

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
  if (k === 'approved' && rtNorm === 'compare') {
    const hasOpen = openCr > 0;
    return {
      label: 'DIRECTION APPROVED',
      color: hasOpen ? 'brand' : 'green',
      tooltip: hasOpen ? 'Changes are still open on this review' : undefined,
    };
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
