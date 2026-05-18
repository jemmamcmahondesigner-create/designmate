import "server-only";

type ReviewerNotificationInput = {
  reviewId: string;
  reviewerIds: string[];
  triggeredByContributorId: string | null;
};

export async function notifyReviewersAssigned({
  reviewId,
  reviewerIds,
  triggeredByContributorId,
}: ReviewerNotificationInput) {
  // TODO(notifications): replace with DB-backed notifications/email provider.
  console.info("[notifications] reviewers_assigned", {
    reviewId,
    reviewerIds,
    triggeredByContributorId,
  });
}

export async function notifyReviewNeedsAttention({
  reviewId,
  reviewerIds,
  triggeredByContributorId,
}: ReviewerNotificationInput) {
  // TODO(notifications): replace with DB-backed notifications/email provider.
  console.info("[notifications] review_needs_attention", {
    reviewId,
    reviewerIds,
    triggeredByContributorId,
  });
}
