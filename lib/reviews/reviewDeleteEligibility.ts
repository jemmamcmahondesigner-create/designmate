import { normalizeReviewStatusKey } from "@/lib/reviews/reviewStatusDisplay";

/** Whether a review may be permanently deleted (type-agnostic). */
export function canDeleteReview(status: string, submittedFeedbackCount: number): boolean {
  const normalized = normalizeReviewStatusKey(status);
  if (normalized === "draft") return true;
  if (normalized === "in-review" && submittedFeedbackCount === 0) return true;
  if (normalized === "paused" && submittedFeedbackCount === 0) return true;
  return false;
}
