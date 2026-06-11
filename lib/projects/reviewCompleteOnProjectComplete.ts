import type { ReviewType } from "@/types/review";

export type ReviewCompleteTarget = "complete" | "draft" | "unchanged";

function normalizeStatus(status: string): string {
  return String(status ?? "").trim().toLowerCase();
}

function normalizeType(reviewType: string): ReviewType | "" {
  const raw = normalizeStatus(reviewType);
  if (raw === "critique" || raw === "align" || raw === "approve" || raw === "compare") {
    return raw;
  }
  if (raw === "approval") return "approve";
  if (raw === "comparison") return "compare";
  if (raw === "alignment") return "align";
  return "";
}

const COMPLETABLE_BY_TYPE: Record<ReviewType, Set<string>> = {
  approve: new Set(["approved", "needs-changes", "changes-needed"]),
  compare: new Set([
    "approved",
    "direction-approved",
    "needs-changes",
    "changes-needed",
  ]),
  align: new Set(["needs-changes", "changes-needed", "feedback-submitted"]),
  critique: new Set(["feedback-submitted"]),
};

export function resolveReviewCompleteTarget(
  reviewType: string,
  currentStatus: string,
): ReviewCompleteTarget {
  const status = normalizeStatus(currentStatus);
  const type = normalizeType(reviewType);

  if (status === "paused" || status === "complete") return "unchanged";
  if (status === "in-review" || status === "draft") return "draft";

  if (type && COMPLETABLE_BY_TYPE[type].has(status)) {
    return "complete";
  }

  return "unchanged";
}
