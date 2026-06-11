import { formatChangeRequestDisplayLabel } from './changeRequestNumbering';

type ChangeRequestLabelRow = {
  id: string;
  reviewer_id?: string | null;
  reviewer_feedback_id?: string | null;
  batch_number?: number | null;
  change_number?: number | null;
  created_at: string;
};

type FeedbackLabelRow = {
  feedbackId?: string | null;
  reviewerId: string;
  status: string;
  feedbackKind?: string | null;
  submittedAt?: string | null;
  requestedAt?: string | null;
};

function resolveReviewerFeedbackIdForChangeRequest(
  cr: ChangeRequestLabelRow,
  allFeedbackRows: FeedbackLabelRow[],
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
  row: FeedbackLabelRow,
  allFeedbackRows: FeedbackLabelRow[],
  changeRequests: ChangeRequestLabelRow[],
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
  allFeedbackRows: FeedbackLabelRow[],
  changeRequests: ChangeRequestLabelRow[],
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

/** Labels like `Change 1.1` from stored batch/change numbers, with legacy fallback. */
export function buildChangeRequestLabelById(
  requests: ChangeRequestLabelRow[],
  allFeedbackRows: FeedbackLabelRow[] = [],
  reviewCreatedAt: string | null | undefined = null,
): Map<string, string> {
  const labelById = new Map<string, string>();
  const withoutStoredNumber = [...requests].filter((cr) => {
    const formatted = formatChangeRequestDisplayLabel(
      cr.batch_number,
      cr.change_number,
    );
    if (formatted) {
      labelById.set(cr.id, formatted);
      return false;
    }
    return cr.change_number == null || !Number.isFinite(Number(cr.change_number));
  });
  const legacyOrder = [...withoutStoredNumber].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const legacyNumberById = new Map<string, number>();
  legacyOrder.forEach((cr, index) => {
    legacyNumberById.set(cr.id, index + 1);
  });

  for (const cr of requests) {
    if (labelById.has(cr.id)) continue;
    const stored = cr.change_number;
    if (stored != null && Number.isFinite(Number(stored))) {
      labelById.set(cr.id, `Change ${stored}`);
      continue;
    }
    const legacy = legacyNumberById.get(cr.id);
    if (legacy != null) {
      labelById.set(cr.id, `Change ${legacy}`);
    }
  }

  if (labelById.size === requests.length) {
    return labelById;
  }

  const byReviewer = new Map<string, ChangeRequestLabelRow[]>();
  for (const request of requests) {
    if (labelById.has(request.id)) continue;
    const reviewerId = request.reviewer_id ?? '';
    const list = byReviewer.get(reviewerId) ?? [];
    list.push(request);
    byReviewer.set(reviewerId, list);
  }

  for (const [reviewerId, items] of byReviewer) {
    const byFeedbackId = new Map<string, ChangeRequestLabelRow[]>();
    for (const cr of items) {
      const resolvedFeedbackId =
        resolveReviewerFeedbackIdForChangeRequest(
          cr,
          allFeedbackRows,
          reviewCreatedAt,
        ) ??
        `__unlinked_${cr.id}`;
      const list = byFeedbackId.get(resolvedFeedbackId) ?? [];
      list.push(cr);
      byFeedbackId.set(resolvedFeedbackId, list);
    }

    for (const [feedbackKey, group] of byFeedbackId) {
      const feedbackId = feedbackKey.startsWith('__unlinked_') ? null : feedbackKey;
      const batchNum = submissionBatchNumberForFeedbackId(
        allFeedbackRows,
        requests,
        reviewerId,
        feedbackId,
        reviewCreatedAt,
      );
      const sorted = [...group].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      sorted.forEach((cr, index) => {
        if (!labelById.has(cr.id)) {
          labelById.set(cr.id, `Change ${batchNum}.${index + 1}`);
        }
      });
    }
  }
  return labelById;
}

export function resolveChangeRequestTagLabel(
  payload: Record<string, unknown>,
  labelById?: Map<string, string>,
): string | null {
  const crId = String(payload.change_request_id ?? '').trim();
  if (crId && labelById?.has(crId)) {
    return labelById.get(crId)!;
  }
  const ref = String(
    payload.change_ref ??
      payload.change_number ??
      payload.artifact_change_index ??
      payload.change_index ??
      '',
  ).trim();
  if (!ref) return null;
  if (/^change\s+/i.test(ref)) return ref;
  return `Change ${ref}`;
}
