import type { ReviewType } from "@/types/review";

export type ReviewerDisplayState = "submitted" | "pending" | "decision-required";

export type PrimaryFeedbackCta =
  | { type: "submit-feedback"; label: "Submit Feedback" | "Edit your feedback" }
  | { type: "make-decision"; label: "Make Decision" }
  | null;

export function canEditReviewDetails(role: string | null) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "designer";
}

export function canUseViewOnlyReviewMode(params: {
  requestedMode: "edit" | "view-only";
  canEditCoreDetails: boolean;
}) {
  return params.requestedMode === "view-only" || !params.canEditCoreDetails;
}

export function canAddTradeoff(params: {
  currentContributorId: string | null;
  requestedMode: "edit" | "view-only";
}) {
  if (!params.currentContributorId) return false;
  return params.requestedMode === "edit" || params.requestedMode === "view-only";
}

export function getDecisionMakerReviewerId(
  reviewType: string | null,
  reviewerIds: string[]
) {
  const normalized = String(reviewType ?? "").trim().toLowerCase() as ReviewType | "";
  if (normalized !== "approve" && normalized !== "compare") return null;
  return reviewerIds[0] ?? null;
}

export function hasAllReviewerFeedbackSubmitted(input: {
  reviewerIds: string[];
  feedbackByReviewerId: Map<string, { status: ReviewerDisplayState }>;
}) {
  if (input.reviewerIds.length === 0) return false;
  return input.reviewerIds.every(
    (reviewerId) => input.feedbackByReviewerId.get(reviewerId)?.status === "submitted"
  );
}

export function canSubmitFeedback(input: {
  currentContributorId: string | null;
  reviewerIds: string[];
  feedbackByReviewerId: Map<string, { status: ReviewerDisplayState }>;
}) {
  if (!input.currentContributorId) return false;
  if (!input.reviewerIds.includes(input.currentContributorId)) return false;
  return true;
}

export function canMakeDecision(input: {
  currentContributorId: string | null;
  decisionMakerReviewerId: string | null;
  allReviewerFeedbackSubmitted: boolean;
  decisionMade: boolean;
}) {
  return (
    Boolean(input.currentContributorId) &&
    input.currentContributorId === input.decisionMakerReviewerId &&
    input.allReviewerFeedbackSubmitted &&
    !input.decisionMade
  );
}

export function getReviewerDisplayState(input: {
  reviewerId: string;
  rawFeedbackStatus: string | null;
  decisionMakerReviewerId: string | null;
  allReviewerFeedbackSubmitted: boolean;
  decisionMade: boolean;
}) {
  const raw = String(input.rawFeedbackStatus ?? "").trim().toLowerCase();
  if (raw === "submitted") return "submitted" as const;
  if (
    input.reviewerId === input.decisionMakerReviewerId &&
    input.allReviewerFeedbackSubmitted &&
    !input.decisionMade
  ) {
    return "decision-required" as const;
  }
  return "pending" as const;
}

export function getPrimaryFeedbackCta(input: {
  canSubmitReviewerFeedback: boolean;
  canCurrentUserMakeDecision: boolean;
  /** When the current user already has a submitted reviewer_feedback row (re-open to edit). */
  currentUserHasSubmittedFeedback?: boolean;
}): PrimaryFeedbackCta {
  if (input.canSubmitReviewerFeedback) {
    return {
      type: "submit-feedback",
      label: input.currentUserHasSubmittedFeedback ? "Edit your feedback" : "Submit Feedback",
    };
  }
  if (input.canCurrentUserMakeDecision) {
    return { type: "make-decision", label: "Make Decision" };
  }
  return null;
}
