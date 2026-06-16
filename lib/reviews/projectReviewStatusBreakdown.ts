import { normalizeReviewStatusKey } from "@/lib/reviews/reviewStatusDisplay";

export type ProjectReviewStatusBreakdown = {
  open: number;
  pausedOrDraft: number;
  completeOrApproved: number;
};

export function emptyProjectReviewStatusBreakdown(): ProjectReviewStatusBreakdown {
  return { open: 0, pausedOrDraft: 0, completeOrApproved: 0 };
}

export type ProjectReviewStatusBucket = keyof ProjectReviewStatusBreakdown;

/** Buckets review statuses for project-card review-count tooltips. */
export function bucketReviewStatusForProjectCard(
  raw: string | null | undefined,
): ProjectReviewStatusBucket {
  const status = normalizeReviewStatusKey(raw);

  if (status === "paused" || status === "draft") {
    return "pausedOrDraft";
  }

  if (
    status === "complete" ||
    status === "approved" ||
    status === "archived" ||
    status === "closed"
  ) {
    return "completeOrApproved";
  }

  return "open";
}

export function formatProjectReviewBreakdownTooltip(
  breakdown: ProjectReviewStatusBreakdown,
): string {
  return [
    `${breakdown.open} open`,
    `${breakdown.pausedOrDraft} paused or draft`,
    `${breakdown.completeOrApproved} complete or approved`,
  ].join("\n");
}
