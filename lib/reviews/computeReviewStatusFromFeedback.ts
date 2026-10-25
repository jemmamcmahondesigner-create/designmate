export type LatestReviewerFeedback = {
  reviewerId: string;
  feedbackStatus: string;
};

export type ComputeReviewStatusFromFeedbackInput = {
  reviewType: string;
  /** Accepted so callers pass the review flag. The live rule does not branch on it. */
  requireDecisionMaker: boolean;
  currentStatus: string;
  assignedReviewerIds: string[];
  latestFeedback: readonly LatestReviewerFeedback[];
  /** Every change request on the review. Approve uses this. */
  changeRequestCount: number;
  /** Change requests that are not completed. Align uses this. */
  openChangeRequestCount: number;
  /**
   * A compare created with one reviewer stays on its current status when that
   * person submits; the decision itself moves it. Removal of the last pending
   * reviewer on a multi-reviewer compare passes false so the remaining
   * submitted feedback still reaches `feedback-submitted`.
   */
  soloCompareStaysPut?: boolean;
};

function normalizeReviewType(reviewType: string): string {
  const value = reviewType.trim().toLowerCase();
  if (value === "comparison") return "compare";
  if (value === "approval") return "approve";
  if (value === "alignment") return "align";
  return value;
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

/**
 * Status to write after feedback changes, or null when the review stays put.
 * This is the submit-path rule: Approve resolves, Align and Critique stop at
 * feedback (or needs-changes), and Compare waits for the decision maker.
 */
export function computeReviewStatusFromFeedback(
  input: ComputeReviewStatusFromFeedbackInput,
): string | null {
  const reviewType = normalizeReviewType(input.reviewType);
  const currentStatus = normalizeStatus(input.currentStatus);
  if (currentStatus === "complete") return null;
  if (input.assignedReviewerIds.length === 0) return null;

  const latestByReviewer = new Map(
    input.latestFeedback.map((row) => [row.reviewerId, normalizeStatus(row.feedbackStatus)]),
  );
  const allSubmitted = input.assignedReviewerIds.every(
    (reviewerId) => latestByReviewer.get(reviewerId) === "submitted",
  );
  if (!allSubmitted) return null;

  if (reviewType === "approve") {
    const next = input.changeRequestCount > 0 ? "needs-changes" : "approved";
    return next === currentStatus ? null : next;
  }

  if (reviewType === "align") {
    const next = input.openChangeRequestCount > 0 ? "needs-changes" : "feedback-submitted";
    return next === currentStatus ? null : next;
  }

  if (currentStatus === "feedback-submitted") return null;

  const soloCompareStaysPut = input.soloCompareStaysPut !== false;
  if (
    reviewType === "compare" &&
    input.assignedReviewerIds.length === 1 &&
    soloCompareStaysPut
  ) {
    return null;
  }

  return "feedback-submitted";
}
