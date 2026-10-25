import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getEffectiveCurrentContributor,
  type ContributorIdentity,
} from "@/lib/auth/effectiveContributor";
import { canEditReviewDetails } from "@/lib/reviews/workflow";
import { EDIT_REVIEW_DENIED_MESSAGE } from "@/lib/workspace/permissions";

/**
 * One product rule: the caller created this review, or their permission
 * (resolved for the review's project) is Editor or Admin.
 * A Reviewer-level member is never allowed unless they are the creator.
 */
export function canEditReview(input: {
  reviewCreatorId?: unknown;
  authUserId?: unknown;
  contributorPermissionLevel?: unknown;
}): boolean {
  const creatorId = String(input.reviewCreatorId ?? "").trim();
  const authUserId = String(input.authUserId ?? "").trim();
  if (creatorId && authUserId && creatorId === authUserId) {
    return true;
  }
  const permissionLevel =
    input.contributorPermissionLevel == null
      ? null
      : String(input.contributorPermissionLevel);
  return canEditReviewDetails(permissionLevel);
}

export async function assertCanEditThisReview(
  supabase: SupabaseClient,
  review: { creator_id?: unknown; project_id?: unknown },
): Promise<
  | { ok: true; contributor: ContributorIdentity | null; authUserId: string }
  | {
      ok: false;
      error: string;
      contributor: ContributorIdentity | null;
      authUserId: string;
    }
> {
  const projectId = String(review.project_id ?? "").trim();
  const contributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined,
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authUserId = String(user?.id ?? "").trim();
  if (
    canEditReview({
      reviewCreatorId: review.creator_id,
      authUserId,
      contributorPermissionLevel: contributor?.permissionLevel ?? null,
    })
  ) {
    return { ok: true, contributor, authUserId };
  }
  return {
    ok: false,
    error: EDIT_REVIEW_DENIED_MESSAGE,
    contributor,
    authUserId,
  };
}
