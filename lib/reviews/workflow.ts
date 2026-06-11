import type { ReviewType } from "@/types/review";
import {
  canCreateReviews,
  normalizeWorkspacePermission,
  type WorkspacePermissionLevel,
} from "@/lib/workspace/permissions";

export type ReviewerDisplayState = "submitted" | "pending" | "decision-required";

export type PrimaryFeedbackCta =
  | { type: "submit-feedback"; label: "Submit Feedback" | "Edit your feedback" }
  | { type: "make-decision"; label: "Make Decision" }
  | null;

/** Editors and admins may create reviews and edit review setup (not job title). */
export function canEditReviewDetails(
  permissionLevel: WorkspacePermissionLevel | string | null,
) {
  if (permissionLevel == null || String(permissionLevel).trim() === "") {
    return false;
  }
  return canCreateReviews(normalizeWorkspacePermission(permissionLevel));
}

function mergePermissionLevels(
  contributorLevel: WorkspacePermissionLevel | string | null,
  workspaceLevel: WorkspacePermissionLevel | string | null,
): WorkspacePermissionLevel {
  const levels = [
    contributorLevel ? normalizeWorkspacePermission(contributorLevel) : null,
    workspaceLevel ? normalizeWorkspacePermission(workspaceLevel) : null,
  ].filter(Boolean) as WorkspacePermissionLevel[];
  if (levels.includes("admin")) return "admin";
  if (levels.includes("editor")) return "editor";
  return levels[0] ?? "reviewer";
}

/** Mirrors server `assertCanSendReviewReminder` for client UI (bell visibility). */
export function canSendReviewReminder(input: {
  permissionLevel: WorkspacePermissionLevel | string | null;
  workspacePermissionLevel?: WorkspacePermissionLevel | string | null;
  reviewOwnerName: string | null;
  currentContributorId: string | null;
  currentContributorName: string | null;
  reviewCreatorContributorId?: string | null;
  reviewCreatorAuthUserId?: string | null;
  currentAuthUserId?: string | null;
}): boolean {
  const perm = mergePermissionLevels(
    input.permissionLevel,
    input.workspacePermissionLevel ?? null,
  );
  if (perm === "admin" || perm === "editor") return true;

  const creatorAuthUserId = String(input.reviewCreatorAuthUserId ?? "").trim();
  const currentAuthUserId = String(input.currentAuthUserId ?? "").trim();
  if (creatorAuthUserId && currentAuthUserId && creatorAuthUserId === currentAuthUserId) {
    return true;
  }

  if (!input.currentContributorId) return false;

  const owner = String(input.reviewOwnerName ?? "")
    .trim()
    .toLowerCase();
  const name = String(input.currentContributorName ?? "")
    .trim()
    .toLowerCase();
  if (owner && name && owner === name) return true;
  const creatorId = String(input.reviewCreatorContributorId ?? "").trim();
  if (creatorId && creatorId === input.currentContributorId) return true;
  return false;
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
