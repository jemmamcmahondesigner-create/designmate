"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEffectiveCurrentContributor } from "@/lib/auth/effectiveContributor";
import {
  notifyReviewNeedsAttention,
} from "@/lib/notifications/reviews";
import { logTimelineEventServer } from "@/lib/timeline/logEventServer";
import { changeRequestCompletedEmailHtml } from "@/lib/emails/change-request-completed-email";
import { sendResendEmail } from "@/lib/emails/send-resend-email";
import {
  notifyCreatorChangeRequested,
  notifyCreatorFeedbackSubmitted,
  notifyDecisionMakerDecisionRequired,
  notifyReviewerFeedbackSubmittedOnBehalf,
} from "@/lib/reviews/notify-review-creator";
import {
  logReviewersNotifiedEvent,
  resolveReviewersNotifiedRecipients,
} from "@/lib/reviews/reviewersNotifiedActivity";
import { sendReviewerNotificationEmails } from "@/lib/reviews/sendReviewerNotificationEmails";
import {
  isResolvedReviewStatus,
  reopenReviewStatusForType,
} from "@/lib/reviews/reviewStatusDisplay";
import { canDeleteReview } from "@/lib/reviews/reviewDeleteEligibility";
import { canEditReviewDetails } from "@/lib/reviews/workflow";
import { resolveNextChangeRequestNumbers, resolveBatchStartForNewSubmission, formatChangeRequestDisplayLabel } from "@/lib/reviews/changeRequestNumbering";
import { EDIT_REVIEW_DENIED_MESSAGE, normalizeWorkspacePermission } from "@/lib/workspace/permissions";
import type { PostgrestError } from "@supabase/supabase-js";

function dedupeIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function toSchemaCacheErrorMessage(error: PostgrestError | null) {
  if (!error) return null;
  if (error.code === "PGRST205") {
    return "Database schema is out of date. Apply local Supabase migrations and restart the local stack.";
  }
  return null;
}

function feedbackRowTimestamp(row: Record<string, unknown>): number {
  const raw = row.feedback_submitted_at ?? row.created_at ?? 0;
  const t = new Date(String(raw)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Latest row per reviewer by feedback_submitted_at (then created_at). */
function latestFeedbackRowPerReviewer(
  rows: Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const reviewerId = String(row.reviewer_id ?? "").trim();
    if (!reviewerId) continue;
    const existing = map.get(reviewerId);
    if (!existing || feedbackRowTimestamp(row) > feedbackRowTimestamp(existing)) {
      map.set(reviewerId, row);
    }
  }
  return map;
}

function reviewerHasSubmittedFeedback(
  rows: Record<string, unknown>[],
  reviewerIds: string[],
): boolean {
  const latest = latestFeedbackRowPerReviewer(rows);
  return reviewerIds.every((reviewerId) => {
    const row = latest.get(reviewerId);
    return String(row?.feedback_status ?? "").trim().toLowerCase() === "submitted";
  });
}

/** When all assigned reviewers have submitted on an Approve review, set lifecycle status from change requests. */
async function maybeUpdateApproveReviewLifecycleStatus(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: {
    reviewId: string;
    projectId: string;
    reviewerIds: string[];
    reviewTitle: string;
    previousReviewStatus: string;
    actorId: string;
  },
) {
  const { reviewId, projectId, reviewerIds, reviewTitle, previousReviewStatus, actorId } =
    input;
  if (reviewerIds.length === 0) return;

  const prevNorm = previousReviewStatus.trim().toLowerCase();
  if (prevNorm === "complete") return;

  const { data: feedbackRows } = await supabase
    .from("reviewer_feedback")
    .select("reviewer_id, feedback_status, feedback_submitted_at, created_at")
    .eq("review_id", reviewId)
    .in("reviewer_id", reviewerIds);

  const allSubmitted = reviewerHasSubmittedFeedback(
    (feedbackRows ?? []) as Record<string, unknown>[],
    reviewerIds,
  );
  if (!allSubmitted) return;

  const { count: changeRequestCount, error: changeRequestError } = await supabase
    .from("change_requests")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId);
  if (changeRequestError) return;

  const nextStatus =
    changeRequestCount != null && changeRequestCount > 0 ? "needs-changes" : "approved";
  if (prevNorm === nextStatus) return;

  await supabase.from("reviews").update({ status: nextStatus }).eq("id", reviewId);
  await logTimelineEventServer(supabase, {
    projectId,
    reviewId,
    actorId,
    eventType: "status_changed",
    payload: {
      review_title: reviewTitle,
      review_id: reviewId,
      previous_status: previousReviewStatus,
      new_status: nextStatus,
      from_status: previousReviewStatus,
      to_status: nextStatus,
      status_transition_trigger: "auto",
    },
  });
  revalidatePath(`/reviews/${reviewId}`);
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
  revalidatePath("/reviews");
}

type ReviewArtifactNameSource = {
  title?: string | null;
  label?: string | null;
  id?: string | null;
  originalFileName?: string | null;
};

function artifactSelectionKeyFromSources(
  title: string | null | undefined,
  id: string | null | undefined,
) {
  const titleTrimmed = String(title ?? "").trim();
  return titleTrimmed !== "" ? titleTrimmed : String(id ?? "").trim();
}

function parseReviewArtifactNameSources(raw: unknown): ReviewArtifactNameSource[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { artifacts?: unknown }).artifacts)
      ? (raw as { artifacts: unknown[] }).artifacts
      : [];
  return list.map((item, index) => {
    if (!item || typeof item !== "object") {
      return { id: `artifact-${index}`, label: "Untitled", title: null };
    }
    const row = item as Record<string, unknown>;
    const title = row.title == null ? null : String(row.title);
    const originalFileName =
      row.originalFileName == null ? null : String(row.originalFileName);
    const label = String(title ?? originalFileName ?? "Untitled").trim() || "Untitled";
    return {
      id: `artifact-${index}`,
      title,
      label,
      originalFileName,
    };
  });
}

function labelsForArtifactKeys(
  keys: string[],
  artifactSources: ReviewArtifactNameSource[],
) {
  return keys.map((key) => {
    const match = artifactSources.find((artifact) => {
      const selectionKey = artifactSelectionKeyFromSources(
        artifact.title ?? artifact.label,
        artifact.id,
      );
      return selectionKey === key || String(artifact.id ?? "") === key;
    });
    return match?.label ?? match?.title ?? key;
  });
}

function toReviewerFeedbackKindColumn(
  kind: ApproveFeedbackActivitySummary["feedback_kind"] | null | undefined,
): string | null {
  if (!kind) return null;
  if (kind === "changes") return "change-request";
  return kind;
}

function formatArtifactNameList(names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, and ${unique[unique.length - 1]}`;
}

function normalizeArtifactIdList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map((value) => String(value).trim()).filter(Boolean)
    : [];
}

function artifactChangeIndexWithinReview(
  rows: Array<{ id?: string; artifact_ids?: unknown }>,
  changeRequestId: string,
  artifactId: string,
): number {
  const normalizedArtifactId = artifactId.trim();
  if (!normalizedArtifactId) return 1;
  let count = 0;
  for (const row of rows) {
    const artifactIds = normalizeArtifactIdList(row.artifact_ids);
    if (artifactIds.includes(normalizedArtifactId)) {
      count += 1;
    }
    if (String(row.id ?? "").trim() === changeRequestId.trim()) {
      return Math.max(1, count);
    }
  }
  return Math.max(1, count || 1);
}

function reviewerFeedbackPreventsRemoval(row: Record<string, unknown>) {
  const status = String(row.feedback_status ?? "")
    .trim()
    .toLowerCase();
  if (status !== "" && status !== "pending") return true;
  if (String(row.feedback_submitted_at ?? "").trim()) return true;
  if (String(row.feedback_text ?? "").trim()) return true;
  if (String(row.selected_option ?? "").trim()) return true;
  return false;
}

type ApproveFeedbackActivitySummary = {
  summary: string;
  approved_artifact_names: string[];
  change_artifact_names: string[];
  change_request_phrases: string[];
  feedback_kind: "approval" | "changes" | "mixed" | "generic";
};

async function buildApproveFeedbackActivitySummary(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: {
    reviewId: string;
    reviewerId: string;
    reviewerName: string;
    selectedArtifactIds: string[];
  },
): Promise<ApproveFeedbackActivitySummary> {
  const { data: review } = await supabase
    .from("reviews")
    .select("artifacts")
    .eq("id", input.reviewId)
    .maybeSingle();
  const artifactSources = parseReviewArtifactNameSources(
    (review as { artifacts?: unknown } | null)?.artifacts,
  );
  const approvedNames = labelsForArtifactKeys(input.selectedArtifactIds, artifactSources);

  const { count: changeRequestCount } = await supabase
    .from("change_requests")
    .select("id", { count: "exact", head: true })
    .eq("review_id", input.reviewId)
    .eq("reviewer_id", input.reviewerId);
  const hasChangeRequests = (changeRequestCount ?? 0) > 0;

  const name = input.reviewerName.trim() || "Reviewer";
  const summary =
    approvedNames.length > 0
      ? `${name} approved ${formatArtifactNameList(approvedNames)}`
      : hasChangeRequests
        ? `${name} submitted feedback`
        : `${name} submitted feedback`;
  const feedback_kind: ApproveFeedbackActivitySummary["feedback_kind"] =
    approvedNames.length > 0 && hasChangeRequests
      ? "mixed"
      : hasChangeRequests
        ? "changes"
        : approvedNames.length > 0
          ? "approval"
          : "generic";
  return {
    summary,
    approved_artifact_names: approvedNames,
    change_artifact_names: [],
    change_request_phrases: [],
    feedback_kind,
  };
}

function submissionBatchNumberForReviewer(
  feedbackRows: Array<{ id: string; created_at?: string | null; feedback_submitted_at?: string | null }>,
  reviewerFeedbackId: string,
): number {
  const sorted = [...feedbackRows].sort((a, b) => {
    const aTs = new Date(String(a.feedback_submitted_at ?? a.created_at ?? 0)).getTime();
    const bTs = new Date(String(b.feedback_submitted_at ?? b.created_at ?? 0)).getTime();
    return aTs - bTs;
  });
  const idx = sorted.findIndex((row) => row.id === reviewerFeedbackId);
  return idx >= 0 ? idx + 1 : Math.max(1, sorted.length);
}

export async function assignReviewersAction(input: {
  reviewId: string;
  reviewerIds: string[];
  requireDecisionMaker: boolean;
  reopenReview?: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select(
      "id, project_id, title, reviewer_contributor_ids, review_type, decision_owner_id, status, owner_display_name",
    )
    .eq("id", input.reviewId)
    .maybeSingle();
  if (!review) {
    return { error: "Review not found." };
  }

  const reviewRow = review as Record<string, unknown>;
  const reviewTitle = String(reviewRow.title ?? "Review").trim() || "Review";
  const reviewStatusNorm = String(reviewRow.status ?? "").trim().toLowerCase();
  if (reviewStatusNorm === "complete") {
    return { error: "Reopen this review to add reviewers." };
  }
  const projectId = String(reviewRow.project_id ?? "");
  const existingIds = Array.isArray(reviewRow.reviewer_contributor_ids)
    ? (reviewRow.reviewer_contributor_ids as unknown[]).map((id) => String(id))
    : [];
  const nextIds = dedupeIds([...existingIds, ...input.reviewerIds]);
  const newlyAddedIds = nextIds.filter((id) => !existingIds.includes(id));

  const rawRt = String(reviewRow.review_type ?? "").trim().toLowerCase();
  const rtNorm =
    rawRt === "comparison" ? "compare" : rawRt === "approval" ? "approve" : rawRt;
  const existingOwner = reviewRow.decision_owner_id;
  const shouldSetDecisionOwner =
    (rtNorm === "compare" || rtNorm === "approve") &&
    nextIds.length > 0 &&
    (existingOwner == null || String(existingOwner).trim() === "");
  const shouldReopenReview = input.reopenReview === true;

  const { error: reviewUpdateError } = await supabase
    .from("reviews")
    .update({
      reviewer_contributor_ids: nextIds,
      ...(shouldReopenReview ? { status: "in-review" } : {}),
      ...(shouldSetDecisionOwner ? { decision_owner_id: nextIds[0] } : {}),
    })
    .eq("id", input.reviewId);
  if (reviewUpdateError) {
    return { error: reviewUpdateError.message };
  }

  if (newlyAddedIds.length > 0) {
    const rows = newlyAddedIds.map((reviewerId) => ({
      review_id: input.reviewId,
      reviewer_id: reviewerId,
      feedback_status: "pending",
    }));
    const { error: insertError } = await supabase.from("reviewer_feedback").insert(rows);
    if (insertError) {
      console.error("[assignReviewers-insert-error]", insertError);
      const schemaMessage = toSchemaCacheErrorMessage(insertError);
      if (schemaMessage) return { error: schemaMessage };
      return { error: insertError.message };
    }
  }

  let reviewersNotified = false;
  if (newlyAddedIds.length > 0) {
    const currentContributor = await getEffectiveCurrentContributor(
      supabase,
      projectId || undefined
    );
    const ownerDisplayName =
      String(reviewRow.owner_display_name ?? "").trim() ||
      currentContributor?.name?.trim() ||
      "A teammate";
    if (reviewStatusNorm !== "draft") {
      const emailsSent = await sendReviewerNotificationEmails(supabase, {
        reviewId: input.reviewId,
        reviewTitle,
        creatorName: ownerDisplayName,
        reviewerIds: newlyAddedIds,
      });
      const activityResult = await logReviewersNotifiedEvent(supabase, {
        projectId,
        reviewId: input.reviewId,
        actorId: currentContributor?.id ?? null,
        actorName: currentContributor?.name?.trim() || ownerDisplayName,
        trigger: "reviewer_added",
        recipientIds: newlyAddedIds,
      });
      if (!activityResult.ok) {
        console.error(
          "[assignReviewers] reviewers_notified activity failed:",
          activityResult.error,
        );
      }
      reviewersNotified = emailsSent > 0;
    }
    const { data: addedContributors } = await supabase
      .from("contributors")
      .select("id, name")
      .in("id", newlyAddedIds);
    const addedReviewerNames = (addedContributors ?? [])
      .map((contributor) => String((contributor as Record<string, unknown>).name ?? "").trim())
      .filter(Boolean);
    if (shouldReopenReview) {
      const reviewerNameLabel =
        addedReviewerNames.length === 0
          ? "Reviewer"
          : addedReviewerNames.length === 1
            ? addedReviewerNames[0]
            : addedReviewerNames.length === 2
              ? `${addedReviewerNames[0]} and ${addedReviewerNames[1]}`
              : `${addedReviewerNames.slice(0, -1).join(", ")}, and ${addedReviewerNames.at(-1)}`;
      await logTimelineEventServer(supabase, {
        projectId,
        reviewId: input.reviewId,
        actorId: currentContributor?.id ?? null,
        eventType: "reviewer_added",
        payload: {
          reviewer_name: reviewerNameLabel,
          reviewer_count: addedReviewerNames.length || newlyAddedIds.length || 1,
          reopened_after_adding: true,
          review_title: reviewTitle,
        }
      });
    } else {
      for (const contributor of addedContributors ?? []) {
        const c = contributor as Record<string, unknown>;
        await logTimelineEventServer(supabase, {
          projectId,
          reviewId: input.reviewId,
          actorId: currentContributor?.id ?? null,
          eventType: "reviewer_added",
          payload: {
            reviewer_name: String(c.name ?? "Reviewer"),
            review_title: reviewTitle,
          }
        });
      }
    }
  }

  revalidatePath(`/reviews/${input.reviewId}`);
  return { error: null, reopened: shouldReopenReview, reviewersNotified };
}

export async function createTeammateFromReviewAction(input: {
  reviewId: string;
  projectId: string;
  name: string;
  email: string | null;
  role: string | null;
  requireDecisionMaker: boolean;
  includeInWorkspace?: boolean;
  reopenReview?: boolean;
}): Promise<{ error: string | null; reviewersNotified?: boolean }> {
  const supabase = await createSupabaseServerClient();
  const name = input.name.trim();
  if (!name) {
    return { error: "Name is required." };
  }

  let workspaceId: string | null = null;
  if (input.includeInWorkspace !== false) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const activeWorkspaceId = user?.user_metadata?.active_workspace_id;
    workspaceId =
      typeof activeWorkspaceId === "string" && activeWorkspaceId.trim()
        ? activeWorkspaceId.trim()
        : null;
  }

  const { data: newContributor, error: insertError } = await supabase
    .from("contributors")
    .insert({
      project_id: input.projectId,
      workspace_id: workspaceId,
      name,
      email: input.email?.trim() ? input.email.trim() : null,
      role: input.role?.trim() ? input.role.trim() : null,
    })
    .select("id, name")
    .single();

  if (insertError) {
    console.error("[create-reviewer-error]", insertError);
    const schemaMessage = toSchemaCacheErrorMessage(insertError);
    if (schemaMessage) return { error: schemaMessage };
    return { error: insertError.message };
  }

  const contributorId = String(
    (newContributor as Record<string, unknown>).id ?? ""
  );
  if (!contributorId) {
    console.error("[create-reviewer-error]", "Missing contributor id after insert");
    return { error: "Contributor was not created." };
  }

  const assignResult = await assignReviewersAction({
    reviewId: input.reviewId,
    reviewerIds: [contributorId],
    requireDecisionMaker: input.requireDecisionMaker,
    reopenReview: input.reopenReview,
  });

  if (assignResult.error) {
    console.error("[create-reviewer-error]", assignResult.error);
    await supabase.from("contributors").delete().eq("id", contributorId);
    return { error: assignResult.error };
  }

  const currentContributor = await getEffectiveCurrentContributor(
    supabase,
    input.projectId || undefined
  );
  await logTimelineEventServer(supabase, {
    projectId: input.projectId,
    reviewId: input.reviewId,
    actorId: currentContributor?.id ?? null,
    eventType: "teammate_added",
    payload: { teammate_name: name },
  });

  return { error: null, reviewersNotified: assignResult.reviewersNotified };
}

export async function removeReviewerAction(input: {
  reviewId: string;
  reviewerContributorId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, project_id, title, status, reviewer_contributor_ids")
    .eq("id", input.reviewId)
    .maybeSingle();
  if (!review) {
    return { error: "Review not found." };
  }

  const reviewRow = review as Record<string, unknown>;
  const existingIds = Array.isArray(reviewRow.reviewer_contributor_ids)
    ? (reviewRow.reviewer_contributor_ids as unknown[]).map((id) => String(id))
    : [];
  const removeId = input.reviewerContributorId.trim();
  const nextIds = existingIds.filter((id) => id !== removeId);
  const projectId = String(reviewRow.project_id ?? "").trim();
  const reviewTitle = String(reviewRow.title ?? "Review").trim() || "Review";
  const previousStatus = String(reviewRow.status ?? "in-review").trim().toLowerCase();

  const { data: removedContributor } = await supabase
    .from("contributors")
    .select("id, name")
    .eq("id", removeId)
    .maybeSingle();
  const removedReviewerName =
    String((removedContributor as Record<string, unknown> | null)?.name ?? "").trim() ||
    "Reviewer";

  const { data: feedbackRows, error: feedbackRowsError } = await supabase
    .from("reviewer_feedback")
    .select("feedback_status, feedback_text, selected_option, feedback_submitted_at")
    .eq("review_id", input.reviewId)
    .eq("reviewer_id", removeId);
  if (feedbackRowsError) {
    return { error: feedbackRowsError.message };
  }
  if (
    (feedbackRows ?? []).some((row) =>
      reviewerFeedbackPreventsRemoval(row as Record<string, unknown>),
    )
  ) {
    return { error: "Can't remove reviewer — feedback already submitted." };
  }

  const { error: reviewUpdateError } = await supabase
    .from("reviews")
    .update({ reviewer_contributor_ids: nextIds })
    .eq("id", input.reviewId);
  if (reviewUpdateError) {
    return { error: reviewUpdateError.message };
  }

  const { error: deleteFeedbackError } = await supabase
    .from("reviewer_feedback")
    .delete()
    .eq("review_id", input.reviewId)
    .eq("reviewer_id", removeId);
  if (deleteFeedbackError) {
    console.error("[removeReviewer-feedback-delete]", deleteFeedbackError);
    return { error: deleteFeedbackError.message };
  }

  const currentContributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined
  );

  if (projectId) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: input.reviewId,
      actorId: currentContributor?.id ?? null,
      eventType: "reviewer_added",
      payload: {
        reviewer_name: removedReviewerName,
        reviewer_removed: true,
      },
    });
  }

  let nextStatus = previousStatus;
  if (nextIds.length > 0) {
    const { data: remainingFeedbackRows } = await supabase
      .from("reviewer_feedback")
      .select("reviewer_id, feedback_status, feedback_submitted_at, created_at")
      .eq("review_id", input.reviewId)
      .in("reviewer_id", nextIds);
    const latestByReviewer = latestFeedbackRowPerReviewer(
      (remainingFeedbackRows ?? []) as Record<string, unknown>[]
    );
    const allSubmitted = nextIds.every((reviewerId) => {
      const row = latestByReviewer.get(reviewerId);
      if (!row) return false;
      return String(row.feedback_status ?? "").trim().toLowerCase() === "submitted";
    });

    const { count: remainingChangeRequestCount, error: remainingChangeRequestError } = await supabase
      .from("change_requests")
      .select("id", { count: "exact", head: true })
      .eq("review_id", input.reviewId)
      .in("reviewer_id", nextIds);
    const hasRemainingChangeRequests =
      !remainingChangeRequestError && (remainingChangeRequestCount ?? 0) > 0;

    if (hasRemainingChangeRequests) {
      nextStatus = "needs-changes";
    } else if (allSubmitted) {
      nextStatus = "approved";
    } else {
      nextStatus = "in-review";
    }
  }

  const autoApproved = nextStatus === "approved" && previousStatus !== "approved";
  if (nextStatus !== previousStatus) {
    await supabase
      .from("reviews")
      .update({ status: nextStatus })
      .eq("id", input.reviewId);
  }

  if (autoApproved && projectId) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: input.reviewId,
      actorId: currentContributor?.id ?? null,
      eventType: "reviewer_added",
      payload: {
        reviewer_name: removedReviewerName,
        auto_approved_after_removal: true,
        tooltip_text:
          "This review was automatically approved after reviewer removal. All remaining reviewers had previously approved.",
        review_title: reviewTitle,
      },
    });
  }

  revalidatePath(`/reviews/${input.reviewId}`);
  return { error: null, autoApproved, nextStatus };
}

async function reviewerHasChangeRequestsForBatches(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  reviewId: string,
  reviewerId: string,
  batchIds: string[],
) {
  if (batchIds.length === 0) return false;
  const { count, error } = await supabase
    .from("change_requests")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .eq("reviewer_id", reviewerId)
    .in("batch_id", batchIds);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function submitReviewerFeedbackAction(input: {
  reviewId: string;
  reviewerId?: string;
  feedbackType?: string;
  selectedArtifactIds?: string[];
  feedbackText?: string;
  feedbackLocation?: string;
  changeRequestBatchIds?: string[];
  /** Update an existing submitted row instead of inserting (Align amend flow). */
  resubmitMode?: boolean;
  existingFeedbackId?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select(
      "project_id, reviewer_contributor_ids, review_type, title, status, creator_id, decision_owner_id, artifacts"
    )
    .eq("id", input.reviewId)
    .maybeSingle();
  if (!review) return { error: "Review not found." };

  const projectId = String((review as Record<string, unknown>).project_id ?? "");
  const assignedReviewerIds = Array.isArray(
    (review as Record<string, unknown>).reviewer_contributor_ids
  )
    ? ((review as Record<string, unknown>).reviewer_contributor_ids as unknown[]).map(
        (id) => String(id)
      )
    : [];
  // The Decision Maker counts as a reviewer for the "all submitted" gate. Union
  // decision_owner_id in so the transition to feedback-submitted can never fire
  // before the DM has submitted, even if the owner was somehow dropped from
  // reviewer_contributor_ids (e.g. via a later reviewer edit/removal).
  const decisionOwnerId = String(
    (review as Record<string, unknown>).decision_owner_id ?? ""
  ).trim();
  const reviewerIds =
    decisionOwnerId && !assignedReviewerIds.includes(decisionOwnerId)
      ? [...assignedReviewerIds, decisionOwnerId]
      : assignedReviewerIds;
  const normalizedReviewType = String(
    (review as Record<string, unknown>).review_type ?? ""
  )
    .trim()
    .toLowerCase();
  const reviewTitle = String((review as Record<string, unknown>).title ?? "Review");
  const previousReviewStatus = String((review as Record<string, unknown>).status ?? "");
  const currentContributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined
  );
  if (!currentContributor) {
    return { error: "No active contributor identity available." };
  }
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const targetReviewerId = String(input.reviewerId ?? currentContributor.id).trim();
  const isReviewCreator =
    String((review as Record<string, unknown>).creator_id ?? "").trim() !== "" &&
    String((review as Record<string, unknown>).creator_id ?? "").trim() ===
      String(authUser?.id ?? "").trim();
  const isOnBehalfSubmission = targetReviewerId !== currentContributor.id;

  if (!targetReviewerId) {
    return { error: "Reviewer is required." };
  }
  if (isOnBehalfSubmission) {
    if (!isReviewCreator) {
      return { error: "Only the review creator can request changes on behalf of a reviewer." };
    }
    if (!reviewerIds.includes(targetReviewerId)) {
      return { error: "Choose an assigned reviewer to submit on behalf of." };
    }
  } else if (!reviewerIds.includes(currentContributor.id)) {
    return { error: "Only assigned reviewers can submit feedback." };
  }

  const { data: targetReviewerRow } =
    targetReviewerId === currentContributor.id
      ? { data: { name: currentContributor.name } }
      : await supabase
          .from("contributors")
          .select("name")
          .eq("id", targetReviewerId)
          .maybeSingle();
  const targetReviewerName =
    String((targetReviewerRow as { name?: string | null } | null)?.name ?? "").trim() ||
    (targetReviewerId === currentContributor.id ? currentContributor.name : "Reviewer");

  const feedbackText = String(input.feedbackText ?? "").trim();
  const selectedArtifactIds = Array.isArray(input.selectedArtifactIds)
    ? input.selectedArtifactIds.map((id) => String(id)).filter(Boolean)
    : [];
  const changeRequestBatchIds = Array.isArray(input.changeRequestBatchIds)
    ? [...new Set(input.changeRequestBatchIds.map((id) => String(id).trim()).filter(Boolean))]
    : [];
  const feedbackLocation = String(input.feedbackLocation ?? "").trim();
  const feedbackType = String(input.feedbackType ?? "").trim().toLowerCase();
  const hasAnySelectedArtifacts = selectedArtifactIds.length > 0;
  const hasFeedbackText = feedbackText.length > 0;
  const hasFeedbackLocation = feedbackLocation.length > 0;
  const isApproveFeedback =
    feedbackType === "approve" ||
    normalizedReviewType === "approve" ||
    normalizedReviewType === "approval";
  const hasLoggedChangeRequestsForApprove =
    isApproveFeedback && changeRequestBatchIds.length > 0
      ? await reviewerHasChangeRequestsForBatches(
          supabase,
          input.reviewId,
          targetReviewerId,
          changeRequestBatchIds,
        )
      : false;
  const isAlignFeedback =
    feedbackType === "align" || normalizedReviewType === "align" || normalizedReviewType === "alignment";
  const hasLoggedChangeRequestsForAlign =
    isAlignFeedback && changeRequestBatchIds.length > 0
      ? await reviewerHasChangeRequestsForBatches(
          supabase,
          input.reviewId,
          targetReviewerId,
          changeRequestBatchIds,
        )
      : false;

  if (
    !hasFeedbackText &&
    !hasAnySelectedArtifacts &&
    !hasFeedbackLocation &&
    !(isApproveFeedback && hasLoggedChangeRequestsForApprove) &&
    !(isAlignFeedback && hasLoggedChangeRequestsForAlign)
  ) {
    return { success: false, error: "Feedback content is required" };
  }

  if (feedbackType === "compare") {
    if (!hasAnySelectedArtifacts || !hasFeedbackText) {
      return {
        error: "Comparison feedback requires a selected artifact and written feedback.",
      };
    }
  } else if (feedbackType === "approve" || isApproveFeedback) {
    if (!hasAnySelectedArtifacts && !hasLoggedChangeRequestsForApprove) {
      return {
        error: "Approve feedback requires approved artifacts or a change request.",
      };
    }
  } else if (feedbackType === "align" || isAlignFeedback) {
    if (!hasFeedbackText && !hasLoggedChangeRequestsForAlign) {
      return {
        error: "Align feedback requires comments or a change request.",
      };
    }
  } else if (feedbackType === "critique") {
    if (!hasFeedbackLocation) {
      return { error: "Critique feedback requires a feedback location." };
    }
  }

  const selectedOptionValue =
    selectedArtifactIds.length > 0
      ? selectedArtifactIds.join(",")
      : feedbackLocation || null;
  const effectiveFeedbackText = feedbackText;
  if (
    !effectiveFeedbackText &&
    !selectedOptionValue &&
    !(isApproveFeedback && hasLoggedChangeRequestsForApprove) &&
    !(isAlignFeedback && hasLoggedChangeRequestsForAlign)
  ) {
    return { error: "Feedback cannot be empty." };
  }

  const alignFeedbackKind: string | null =
    isAlignFeedback && hasLoggedChangeRequestsForAlign
      ? hasFeedbackText
        ? "mixed"
        : "change-request"
      : isAlignFeedback
        ? "generic"
        : null;

  const approveActivitySummary =
    normalizedReviewType === "approve" || normalizedReviewType === "approval"
      ? await buildApproveFeedbackActivitySummary(supabase, {
          reviewId: input.reviewId,
          reviewerId: targetReviewerId,
          reviewerName: targetReviewerName,
          selectedArtifactIds,
        })
      : null;

  let storedFeedbackText = effectiveFeedbackText;
  if (
    isApproveFeedback &&
    !storedFeedbackText &&
    approveActivitySummary &&
    approveActivitySummary.approved_artifact_names.length > 0
  ) {
    storedFeedbackText = `Approved ${formatArtifactNameList(
      approveActivitySummary.approved_artifact_names,
    )}.`;
  }

  // Compare: capture the reviewer's prior submitted preference (latest) BEFORE
  // inserting the new row, so we can log a "updated their concept preference
  // from … to …" activity entry when the selection changes.
  let priorComparePreferenceOption: string | null = null;
  if (normalizedReviewType === "compare" || normalizedReviewType === "comparison") {
    const { data: priorPreferenceRows } = await supabase
      .from("reviewer_feedback")
      .select("selected_option, feedback_submitted_at, created_at")
      .eq("review_id", input.reviewId)
      .eq("reviewer_id", targetReviewerId)
      .eq("feedback_status", "submitted");
    const latestPrior = [
      ...((priorPreferenceRows ?? []) as Record<string, unknown>[]),
    ].sort((a, b) => feedbackRowTimestamp(b) - feedbackRowTimestamp(a))[0];
    priorComparePreferenceOption =
      latestPrior?.selected_option == null
        ? null
        : String(latestPrior.selected_option);
  }

  const resubmitMode = Boolean(input.resubmitMode);
  const existingFeedbackId = String(input.existingFeedbackId ?? "").trim();
  const isAlignResubmit = isAlignFeedback && resubmitMode && existingFeedbackId;

  if (isAlignResubmit) {
    const { data: existingRow } = await supabase
      .from("reviewer_feedback")
      .select("id, reviewer_id, feedback_status")
      .eq("id", existingFeedbackId)
      .eq("review_id", input.reviewId)
      .maybeSingle();
    if (!existingRow) {
      return { error: "Existing feedback not found." };
    }
    if (String((existingRow as { reviewer_id?: string }).reviewer_id ?? "") !== targetReviewerId) {
      return { error: "You can only update your own feedback." };
    }
    if (String((existingRow as { feedback_status?: string }).feedback_status ?? "") !== "submitted") {
      return { error: "Only submitted feedback can be updated." };
    }
  }

  const feedbackPayload = {
    review_id: input.reviewId,
    reviewer_id: targetReviewerId,
    submitted_by_id: currentContributor.id,
    feedback_status: "submitted",
    feedback_text: storedFeedbackText || null,
    selected_option: selectedOptionValue,
    feedback_submitted_at: new Date().toISOString(),
    feedback_kind:
      toReviewerFeedbackKindColumn(approveActivitySummary?.feedback_kind) ?? alignFeedbackKind,
  };

  let newFeedbackId = "";
  if (isAlignResubmit) {
    const { error: updateError } = await supabase
      .from("reviewer_feedback")
      .update({
        feedback_text: feedbackPayload.feedback_text,
        selected_option: feedbackPayload.selected_option,
        feedback_submitted_at: feedbackPayload.feedback_submitted_at,
        feedback_kind: feedbackPayload.feedback_kind,
        submitted_by_id: feedbackPayload.submitted_by_id,
      })
      .eq("id", existingFeedbackId)
      .eq("review_id", input.reviewId);
    if (updateError) {
      const schemaMessage = toSchemaCacheErrorMessage(updateError);
      if (schemaMessage) return { error: schemaMessage };
      return { error: updateError.message };
    }
    newFeedbackId = existingFeedbackId;
  } else {
    const { data: insertedFeedback, error } = await supabase
      .from("reviewer_feedback")
      .insert(feedbackPayload)
      .select("id")
      .single();
    if (error) {
      const schemaMessage = toSchemaCacheErrorMessage(error);
      if (schemaMessage) return { error: schemaMessage };
      return { error: error.message };
    }
    newFeedbackId = String((insertedFeedback as { id?: string } | null)?.id ?? "");
  }
  if (newFeedbackId && changeRequestBatchIds.length > 0) {
    await supabase
      .from("change_requests")
      .update({ reviewer_feedback_id: newFeedbackId })
      .eq("review_id", input.reviewId)
      .eq("reviewer_id", targetReviewerId)
      .is("reviewer_feedback_id", null)
      .in("batch_id", changeRequestBatchIds);
  }

  if (isAlignResubmit) {
    await supabase.from("review_activity").insert({
      review_id: input.reviewId,
      contributor_id: currentContributor.id,
      activity_type: "feedback_updated",
      metadata: {
        review_type: normalizedReviewType,
        reviewer_name: targetReviewerName,
        review_title: reviewTitle,
        activity_summary: `${targetReviewerName} updated their feedback on ${reviewTitle}`,
      },
    });
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: input.reviewId,
      actorId: currentContributor.id,
      eventType: "feedback_provided",
      payload: {
        review_title: reviewTitle,
        review_id: input.reviewId,
        review_type: normalizedReviewType,
        activity_summary: `${targetReviewerName} updated their feedback on ${reviewTitle}`,
        feedback_status: "submitted",
      },
    });
  } else {
    await supabase.from("review_activity").insert({
      review_id: input.reviewId,
      contributor_id: currentContributor.id,
      activity_type: "feedback_submitted",
      metadata: {
        review_type: normalizedReviewType,
        feedback_type: feedbackType || null,
        activity_summary: approveActivitySummary?.summary ?? null,
        approved_artifact_names: approveActivitySummary?.approved_artifact_names ?? [],
        change_artifact_names: approveActivitySummary?.change_artifact_names ?? [],
        feedback_kind: approveActivitySummary?.feedback_kind ?? null,
        selected_artifact_ids: selectedArtifactIds,
        feedback_status: "submitted",
        on_behalf_of_name: isOnBehalfSubmission ? targetReviewerName : null,
      },
    });
  }
  // TODO(activity-tab): wire Activity tab to read from `review_activity`.

  // Log feedback/selection timeline events before lifecycle status transitions
  // so Activity tab ordering is correct (selection before feedback-submitted).
  const isApproveReview =
    normalizedReviewType === "approve" || normalizedReviewType === "approval";
  if (
    isApproveReview &&
    approveActivitySummary &&
    approveActivitySummary.approved_artifact_names.length > 0
  ) {
    for (let index = 0; index < approveActivitySummary.approved_artifact_names.length; index++) {
      const artifactName = approveActivitySummary.approved_artifact_names[index] ?? "";
      const artifactId = selectedArtifactIds[index] ?? "";
      await logTimelineEventServer(supabase, {
        projectId,
        reviewId: input.reviewId,
        actorId: currentContributor.id,
        eventType: "feedback_provided",
        payload: {
          review_title: reviewTitle,
          review_id: input.reviewId,
          review_type: normalizedReviewType,
          activity_summary: null,
          artifact_id: artifactId,
          artifact_name: artifactName,
          approved_artifact_names: artifactName ? [artifactName] : [],
          feedback_kind: "approval",
          feedback_status: "submitted",
          on_behalf_of_name: isOnBehalfSubmission ? targetReviewerName : null,
        },
      });
    }
  } else if (!isApproveReview && !isAlignResubmit) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: input.reviewId,
      actorId: currentContributor.id,
      eventType: "feedback_provided",
      payload: {
        review_title: reviewTitle,
        review_id: input.reviewId,
        review_type: normalizedReviewType,
        activity_summary: approveActivitySummary?.summary ?? null,
        approved_artifact_names: approveActivitySummary?.approved_artifact_names ?? [],
        change_artifact_names: approveActivitySummary?.change_artifact_names ?? [],
        feedback_kind: approveActivitySummary?.feedback_kind ?? null,
        selected_artifact_ids: selectedArtifactIds,
        feedback_status: "submitted",
        on_behalf_of_name: isOnBehalfSubmission ? targetReviewerName : null,
      },
    });
  }

  if (
    (normalizedReviewType === "compare" || normalizedReviewType === "comparison") &&
    selectedArtifactIds.length > 0
  ) {
    const compareArtifactSources = parseReviewArtifactNameSources(
      (review as { artifacts?: unknown }).artifacts,
    );
    const newConceptLabel =
      formatArtifactNameList(
        labelsForArtifactKeys(selectedArtifactIds, compareArtifactSources),
      ) || String(selectedArtifactIds[0] ?? "");
    const priorKeys = String(priorComparePreferenceOption ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const preferenceChanged =
      priorKeys.length > 0 && priorKeys.join(",") !== selectedArtifactIds.join(",");
    const previousConceptLabel = preferenceChanged
      ? formatArtifactNameList(
          labelsForArtifactKeys(priorKeys, compareArtifactSources),
        ) || (priorKeys[0] ?? null)
      : null;
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: input.reviewId,
      actorId: currentContributor.id,
      eventType: "concept_selected",
      payload: {
        concept_name: newConceptLabel,
        previous_concept_name: previousConceptLabel,
        review_title: reviewTitle,
        review_id: input.reviewId,
        review_type: "comparison",
        selection_stage: "preference"
      }
    });
  }

  if (reviewerIds.length > 0 && !isAlignResubmit) {
    const { data: feedbackRows } = await supabase
      .from("reviewer_feedback")
      .select("reviewer_id, feedback_status, feedback_submitted_at, created_at")
      .eq("review_id", input.reviewId)
      .in("reviewer_id", reviewerIds);

    const allSubmitted = reviewerHasSubmittedFeedback(
      (feedbackRows ?? []) as Record<string, unknown>[],
      reviewerIds,
    );
    const prevNorm = previousReviewStatus.trim().toLowerCase();
    const skipAutoFeedbackSubmitted =
      prevNorm === "complete" || prevNorm === "feedback-submitted";

    if (
      normalizedReviewType === "approve" ||
      normalizedReviewType === "approval"
    ) {
      if (allSubmitted) {
        await maybeUpdateApproveReviewLifecycleStatus(supabase, {
          reviewId: input.reviewId,
          projectId,
          reviewerIds,
          reviewTitle,
          previousReviewStatus,
          actorId: currentContributor.id,
        });
      }
    } else if (
      (normalizedReviewType === "align" || normalizedReviewType === "alignment") &&
      allSubmitted &&
      prevNorm !== "complete"
    ) {
      const { count: alignOpenChangeRequestCount, error: alignCrError } = await supabase
        .from("change_requests")
        .select("id", { count: "exact", head: true })
        .eq("review_id", input.reviewId)
        .is("completed_at", null);
      const nextAlignStatus =
        !alignCrError && (alignOpenChangeRequestCount ?? 0) > 0
          ? "needs-changes"
          : "feedback-submitted";
      if (prevNorm !== nextAlignStatus) {
        await supabase
          .from("reviews")
          .update({ status: nextAlignStatus })
          .eq("id", input.reviewId);
        await logTimelineEventServer(supabase, {
          projectId,
          reviewId: input.reviewId,
          actorId: currentContributor.id,
          eventType: "status_changed",
          payload: {
            review_title: reviewTitle,
            review_id: input.reviewId,
            previous_status: previousReviewStatus,
            new_status: nextAlignStatus,
            from_status: previousReviewStatus,
            to_status: nextAlignStatus,
            status_transition_trigger: "auto",
          },
        });
        revalidatePath(`/reviews/${input.reviewId}`);
        if (projectId) {
          revalidatePath(`/projects/${projectId}`);
        }
        revalidatePath("/reviews");
      }
    } else if (
      allSubmitted &&
      !skipAutoFeedbackSubmitted &&
      normalizedReviewType !== "align" &&
      normalizedReviewType !== "alignment" &&
      !(
        (normalizedReviewType === "compare" ||
          normalizedReviewType === "comparison") &&
        reviewerIds.length === 1
      )
    ) {
      const nextAlignOrFeedbackStatus = "feedback-submitted";
      await supabase
        .from("reviews")
        .update({ status: nextAlignOrFeedbackStatus })
        .eq("id", input.reviewId);
      await logTimelineEventServer(supabase, {
        projectId,
        reviewId: input.reviewId,
        actorId: currentContributor.id,
        eventType: "status_changed",
        payload: {
          review_title: reviewTitle,
          review_id: input.reviewId,
          previous_status: previousReviewStatus,
          new_status: nextAlignOrFeedbackStatus,
          from_status: previousReviewStatus,
          to_status: nextAlignOrFeedbackStatus,
          status_transition_trigger: "auto",
        },
      });
      if (normalizedReviewType === "compare" || normalizedReviewType === "comparison") {
        await notifyDecisionMakerDecisionRequired(supabase, {
          reviewId: input.reviewId,
          decisionOwnerId: decisionOwnerId || null,
        });
      }
    }
  }

  const recipients = reviewerIds.filter((id) => id !== currentContributor.id);
  if (recipients.length > 0) {
    await notifyReviewNeedsAttention({
      reviewId: input.reviewId,
      reviewerIds: recipients,
      triggeredByContributorId: currentContributor.id,
    });
  }

  if (isApproveReview && newFeedbackId) {
    const { data: reviewerFeedbackHistory } = await supabase
      .from("reviewer_feedback")
      .select("id, created_at, feedback_submitted_at")
      .eq("review_id", input.reviewId)
      .eq("reviewer_id", targetReviewerId)
      .eq("feedback_status", "submitted")
      .order("created_at", { ascending: true });
    const batchNum = submissionBatchNumberForReviewer(
      (reviewerFeedbackHistory ?? []) as Array<{
        id: string;
        created_at?: string | null;
        feedback_submitted_at?: string | null;
      }>,
      newFeedbackId,
    );
    const linkedChangeRows =
      changeRequestBatchIds.length > 0
        ? (
            await supabase
              .from("change_requests")
              .select("id, artifact_ids, created_at, batch_id")
              .eq("review_id", input.reviewId)
              .eq("reviewer_feedback_id", newFeedbackId)
              .in("batch_id", changeRequestBatchIds)
              .order("created_at", { ascending: true })
          ).data
        : [];
    const { data: allReviewChangeRows } = await supabase
      .from("change_requests")
      .select("id, artifact_ids, created_at")
      .eq("review_id", input.reviewId)
      .order("created_at", { ascending: true });
    const { data: reviewArtifactsRow } = await supabase
      .from("reviews")
      .select("artifacts")
      .eq("id", input.reviewId)
      .maybeSingle();
    const artifactSources = parseReviewArtifactNameSources(
      (reviewArtifactsRow as { artifacts?: unknown } | null)?.artifacts,
    );
    for (let index = 0; index < (linkedChangeRows ?? []).length; index++) {
      const row = (linkedChangeRows ?? [])[index] as {
        id?: string;
        artifact_ids?: unknown;
      };
      const keys = Array.isArray(row.artifact_ids)
        ? row.artifact_ids.map((value) => String(value).trim()).filter(Boolean)
        : [];
      const names = labelsForArtifactKeys(keys, artifactSources);
      const decisionChangeNumber = `${batchNum}.${index + 1}`;
      for (let artifactIndex = 0; artifactIndex < keys.length; artifactIndex++) {
        const artifactId = keys[artifactIndex] ?? "";
        const artifactName = names[artifactIndex] ?? artifactId;
        await logTimelineEventServer(supabase, {
          projectId,
          reviewId: input.reviewId,
          actorId: currentContributor.id,
          eventType: "change_requested",
          payload: {
            review_title: reviewTitle,
            review_id: input.reviewId,
            review_type: normalizedReviewType,
            change_request_id: String(row.id ?? ""),
            reviewer_feedback_id: newFeedbackId,
            artifact_id: artifactId,
            artifact_name: artifactName,
            change_ref: decisionChangeNumber,
            change_number: decisionChangeNumber,
            artifact_change_index: artifactChangeIndexWithinReview(
              (allReviewChangeRows ?? []) as Array<{ id?: string; artifact_ids?: unknown }>,
              String(row.id ?? ""),
              artifactId,
            ),
            on_behalf_of_name: isOnBehalfSubmission ? targetReviewerName : null,
          },
        });
      }
    }
  }

  if (!isAlignResubmit) {
    if (!isOnBehalfSubmission) {
      await notifyCreatorFeedbackSubmitted(supabase, {
        reviewId: input.reviewId,
        reviewerId: targetReviewerId,
        reviewerName: targetReviewerName,
        feedbackText: effectiveFeedbackText || null,
      });
    }
    if (isOnBehalfSubmission) {
      await notifyReviewerFeedbackSubmittedOnBehalf(supabase, {
        reviewId: input.reviewId,
        reviewerId: targetReviewerId,
        reviewerName: targetReviewerName,
        submittedByName: currentContributor.name,
      });
    }
  }

  revalidatePath(`/reviews/${input.reviewId}`);
  return { error: null };
}

export async function createChangeRequestAction(input: {
  reviewId: string;
  reviewerId: string;
  artifactIds: string[];
  changesNeeded?: string;
  batchId?: string | null;
  /** Skip cache revalidation until the feedback drawer closes. */
  deferRevalidate?: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const artifactIdentifiers = Array.isArray(input.artifactIds)
    ? input.artifactIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!input.reviewId.trim()) return { error: "Review is required." };
  if (!input.reviewerId.trim()) return { error: "Reviewer is required." };
  if (artifactIdentifiers.length === 0) {
    return { error: "Select at least one artifact." };
  }
  const { data: review } = await supabase
    .from("reviews")
    .select("project_id, title, review_type, status, reviewer_contributor_ids, artifacts, creator_id")
    .eq("id", input.reviewId)
    .maybeSingle();
  if (!review) return { error: "Review not found." };
  const reviewRow = (review ?? {}) as Record<string, unknown>;
  const normalizedReviewType = String(reviewRow.review_type ?? "")
    .trim()
    .toLowerCase();
  const reviewTypeNorm =
    normalizedReviewType === "comparison"
      ? "compare"
      : normalizedReviewType === "approval"
        ? "approve"
        : normalizedReviewType;
  const reviewStatus = String(reviewRow.status ?? "").trim().toLowerCase();
  if (reviewTypeNorm === "compare" && reviewStatus === "approved") {
    return {
      error: "Change requests cannot be added after direction is approved.",
    };
  }
  const projectId = String(reviewRow.project_id ?? "");
  const currentContributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined
  );
  if (!currentContributor) {
    return { error: "No active contributor identity available." };
  }
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const targetReviewerId = input.reviewerId.trim();
  const reviewerIds = Array.isArray(reviewRow.reviewer_contributor_ids)
    ? (reviewRow.reviewer_contributor_ids as unknown[]).map((id) => String(id))
    : [];
  const isReviewCreator =
    String(reviewRow.creator_id ?? "").trim() !== "" &&
    String(reviewRow.creator_id ?? "").trim() === String(authUser?.id ?? "").trim();
  const isOnBehalfSubmission = targetReviewerId !== currentContributor.id;
  if (isOnBehalfSubmission) {
    if (!isReviewCreator) {
      return { error: "Only the review creator can submit feedback on behalf of a reviewer." };
    }
    if (!reviewerIds.includes(targetReviewerId)) {
      return { error: "Choose an assigned reviewer to submit on behalf of." };
    }
  } else if (!reviewerIds.includes(currentContributor.id)) {
    return { error: "Only assigned reviewers can request changes." };
  }
  const { data: targetReviewerRow } =
    targetReviewerId === currentContributor.id
      ? { data: { name: currentContributor.name } }
      : await supabase
          .from("contributors")
          .select("name")
          .eq("id", targetReviewerId)
          .maybeSingle();
  const targetReviewerName =
    String((targetReviewerRow as { name?: string | null } | null)?.name ?? "").trim() ||
    (targetReviewerId === currentContributor.id ? currentContributor.name : "Reviewer");

  const numbering = await resolveNextChangeRequestNumbers(
    supabase,
    input.reviewId,
    input.batchId,
  );

  const { data: insertedRow, error } = await supabase
    .from("change_requests")
    .insert({
      review_id: input.reviewId,
      reviewer_id: targetReviewerId,
      artifact_ids: artifactIdentifiers,
      changes_needed: String(input.changesNeeded ?? "").trim() || null,
      batch_id: numbering.batchId,
      batch_number: numbering.batchNumber,
      change_number: numbering.changeNumber,
    })
    .select("id")
    .single();
  if (error) {
    const schemaMessage = toSchemaCacheErrorMessage(error);
    if (schemaMessage) return { error: schemaMessage };
    return { error: error.message };
  }

  const reviewTitle = String(reviewRow.title ?? "Review");
  const previousReviewStatus = String(reviewRow.status ?? "");

  const artifactSources = parseReviewArtifactNameSources(reviewRow.artifacts);
  const changeArtifactNames = labelsForArtifactKeys(artifactIdentifiers, artifactSources);
  const { data: reviewerChangeRows } = await supabase
    .from("change_requests")
    .select("id, artifact_ids, created_at")
    .eq("review_id", input.reviewId)
    .order("created_at", { ascending: true });
  const insertedId = String((insertedRow as { id?: string } | null)?.id ?? "");

  const displayChangeRef =
    formatChangeRequestDisplayLabel(numbering.batchNumber, numbering.changeNumber) ??
    `${numbering.batchNumber}.${numbering.changeNumber}`;

  if (normalizedReviewType !== "approve" && normalizedReviewType !== "approval") {
    for (let index = 0; index < artifactIdentifiers.length; index++) {
      const artifactId = artifactIdentifiers[index] ?? "";
      const artifactName = changeArtifactNames[index] ?? artifactId;
      const artifactChangeIndex = artifactChangeIndexWithinReview(
        (reviewerChangeRows ?? []) as Array<{ id?: string; artifact_ids?: unknown }>,
        insertedId,
        artifactId,
      );
      await logTimelineEventServer(supabase, {
        projectId,
        reviewId: input.reviewId,
        actorId: currentContributor.id,
        eventType: "change_requested",
        payload: {
          review_title: reviewTitle,
          review_id: input.reviewId,
          artifact_id: artifactId,
          artifact_name: artifactName,
          artifact_change_index: artifactChangeIndex,
          change_ref: displayChangeRef.replace(/^Change\s+/i, ""),
          change_number: displayChangeRef.replace(/^Change\s+/i, ""),
          activity_summary: artifactName
            ? `requested Change #${artifactChangeIndex} on ${artifactName}`
            : `requested Change #${artifactChangeIndex}`,
          review_type: String(reviewRow.review_type ?? ""),
          change_request_id: insertedId,
          on_behalf_of_name: isOnBehalfSubmission ? targetReviewerName : null,
        },
      });
    }
  }

  if (normalizedReviewType === "approve" || normalizedReviewType === "approval") {
    await maybeUpdateApproveReviewLifecycleStatus(supabase, {
      reviewId: input.reviewId,
      projectId,
      reviewerIds,
      reviewTitle,
      previousReviewStatus,
      actorId: currentContributor.id,
    });
  }

  if (insertedId) {
    await notifyCreatorChangeRequested(supabase, {
      reviewId: input.reviewId,
      requesterId: currentContributor.id,
      latestChangeRequestId: insertedId,
    });
  }

  if (!input.deferRevalidate) {
    revalidatePath(`/reviews/${input.reviewId}`);
  }
  return { error: null };
}

export async function submitReplyAction(input: {
  type: "feedback" | "change_request";
  id: string;
  replyText: string;
  replyById: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const table = input.type === "feedback" ? "reviewer_feedback" : "change_requests";
  const idColumn = "id";
  const reviewIdColumn = "review_id";
  const trimmedReply = input.replyText.trim();
  if (!trimmedReply) return { success: false, error: "Reply cannot be empty." };

  const { data: row, error: rowError } = await supabase
    .from(table)
    .select(reviewIdColumn)
    .eq(idColumn, input.id)
    .maybeSingle();
  if (rowError || !row) {
    return { success: false, error: rowError?.message ?? "Reply target not found." };
  }

  const { error } = await supabase.from("card_replies").insert({
    card_type: input.type === "feedback" ? "feedback" : "change_request",
    card_id: input.id,
    reply_text: trimmedReply,
    reply_by_id: input.replyById,
  });
  if (error) return { success: false, error: error.message };

  const reviewId = String((row as Record<string, unknown>).review_id ?? "");
  if (reviewId) revalidatePath(`/reviews/${reviewId}`);
  return { success: true };
}

const ALLOWED_REVIEW_TYPES = new Set(["compare", "critique", "align", "approve"]);

export async function updateReviewTypeAction(input: {
  reviewId: string;
  reviewType: string;
}): Promise<{ success: boolean; error?: string }> {
  const reviewId = String(input.reviewId ?? "").trim();
  if (!reviewId) return { success: false, error: "Review is required." };

  const raw = String(input.reviewType ?? "").trim().toLowerCase();
  const normalized =
    raw === "comparison"
      ? "compare"
      : raw === "alignment"
        ? "align"
        : raw === "approval"
          ? "approve"
          : raw;
  if (!ALLOWED_REVIEW_TYPES.has(normalized)) {
    return { success: false, error: "Invalid review type." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: submittedRows, error: submittedError } = await supabase
    .from("reviewer_feedback")
    .select("id")
    .eq("review_id", reviewId)
    .eq("feedback_status", "submitted")
    .limit(1);
  if (submittedError) {
    return { success: false, error: submittedError.message };
  }
  if ((submittedRows?.length ?? 0) > 0) {
    return {
      success: false,
      error: "Review type cannot be changed after feedback has been submitted.",
    };
  }

  const requireDecisionMaker =
    normalized === "compare" || normalized === "approve";

  const { error } = await supabase
    .from("reviews")
    .update({
      review_type: normalized,
      require_decision_maker: requireDecisionMaker,
    })
    .eq("id", reviewId);
  if (error) {
    const schemaMessage = toSchemaCacheErrorMessage(error);
    if (schemaMessage) return { success: false, error: schemaMessage };
    return { success: false, error: error.message };
  }

  revalidatePath(`/reviews/${reviewId}`);
  return { success: true };
}

export async function saveReviewFocusAction(input: {
  reviewId: string;
  reviewFocus: string;
}): Promise<{ success: boolean; error?: string }> {
  const reviewId = String(input.reviewId ?? "").trim();
  if (!reviewId) return { success: false, error: "Review is required." };

  const supabase = await createSupabaseServerClient();
  const focus = String(input.reviewFocus ?? "").trim();
  const { error } = await supabase
    .from("reviews")
    .update({ review_focus: focus || null })
    .eq("id", reviewId);
  if (error) {
    const schemaMessage = toSchemaCacheErrorMessage(error);
    if (schemaMessage) return { success: false, error: schemaMessage };
    return { success: false, error: error.message };
  }

  revalidatePath(`/reviews/${reviewId}`);
  return { success: true };
}

/** Values the designer may set via the review lifecycle control (Draft / Paused / resume / Complete). */
const MANUAL_LIFECYCLE_STATUSES = new Set([
  "draft",
  "paused",
  "in-review",
  "complete",
  "approved",
  "feedback-submitted",
]);

function normalizeLifecycleKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeReviewTypeForLifecycle(reviewType: string) {
  const x = String(reviewType ?? "").trim().toLowerCase();
  if (x === "comparison") return "compare";
  if (x === "approval") return "approve";
  if (x === "alignment") return "align";
  return x;
}

function lifecycleTransitionError(
  current: string,
  next: string,
  reviewType: string,
): string | null {
  const c = normalizeLifecycleKey(current);
  const n = normalizeLifecycleKey(next);
  const rt = normalizeReviewTypeForLifecycle(reviewType);
  const reopenTarget = reopenReviewStatusForType(rt);

  if (n === "complete") {
    if (isResolvedReviewStatus(c)) return null;
    return "Complete can only be set from a resolved review status.";
  }

  if (n === reopenTarget && c === "complete") {
    return null;
  }

  if (n === "paused") {
    if (
      c === "in-review" ||
      c === "needs-changes" ||
      c === "changes-needed" ||
      isResolvedReviewStatus(c)
    ) {
      return null;
    }
    return "Paused cannot be set from this status.";
  }
  if (n === "draft") {
    if (c === "paused" || c === "in-review") return null;
    return "You can only switch to Draft from Paused or In Review.";
  }
  if (n === "in-review") {
    if (c === "paused" || c === "draft") return null;
    return "In Review can only be started from Draft or resumed from Paused.";
  }
  return "That status cannot be set manually.";
}

function assertCanEditReview(contributor: { permissionLevel: string | null } | null) {
  if (!canEditReviewDetails(contributor?.permissionLevel ?? null)) {
    return { ok: false as const, error: EDIT_REVIEW_DENIED_MESSAGE };
  }
  return { ok: true as const };
}

async function notifyReviewerChangeRequestCompleted(input: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  reviewId: string;
  reviewerId: string;
  actorName: string;
}) {
  const { data: reviewRow } = await input.supabase
    .from("reviews")
    .select("title")
    .eq("id", input.reviewId)
    .maybeSingle();
  const reviewTitle = String((reviewRow as { title?: string | null } | null)?.title ?? "Review");
  const { data: reviewerRow } = await input.supabase
    .from("contributors")
    .select("email, name")
    .eq("id", input.reviewerId)
    .maybeSingle();
  const email = String((reviewerRow as { email?: string | null } | null)?.email ?? "").trim();
  if (!email) return;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";
  const reviewUrl = `${origin.replace(/\/$/, "")}/reviews/${input.reviewId}`;
  await sendResendEmail({
    to: email,
    subject: `Change request marked complete — ${reviewTitle}`,
    html: changeRequestCompletedEmailHtml({
      creatorName: input.actorName,
      reviewTitle,
      reviewUrl,
    }),
  });
}

export async function markChangeRequestsCompletedAction(input: {
  reviewId: string;
  changeRequestIds: string[];
}): Promise<{ success: boolean; error?: string }> {
  const reviewId = String(input.reviewId ?? "").trim();
  const ids = Array.isArray(input.changeRequestIds)
    ? input.changeRequestIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!reviewId || ids.length === 0) {
    return { success: false, error: "Change request is required." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, project_id, creator_id, title")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { success: false, error: "Review not found." };

  const projectId = String((review as Record<string, unknown>).project_id ?? "");
  const reviewTitle = String((review as Record<string, unknown>).title ?? "Review");
  const contributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined,
  );
  if (!contributor) {
    return { success: false, error: "No active contributor identity available." };
  }

  const { data: rows } = await supabase
    .from("change_requests")
    .select("id, reviewer_id, completed_at, batch_number, change_number")
    .eq("review_id", reviewId)
    .in("id", ids);
  if (!rows?.length) {
    return { success: false, error: "Change request not found." };
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const isReviewCreator =
    String((review as Record<string, unknown>).creator_id ?? "").trim() !== "" &&
    String((review as Record<string, unknown>).creator_id ?? "").trim() ===
      String(authUser?.id ?? "").trim();
  const canEdit = canEditReviewDetails(contributor.permissionLevel ?? null);

  for (const row of rows as Array<{ id?: string; reviewer_id?: string | null }>) {
    const reviewerId = String(row.reviewer_id ?? "").trim();
    const isOwner = reviewerId === contributor.id;
    if (!isOwner && !isReviewCreator && !canEdit) {
      return { success: false, error: "You cannot mark this change request as completed." };
    }
  }

  const completedAt = new Date().toISOString();
  const { error } = await supabase
    .from("change_requests")
    .update({ completed_at: completedAt, completed_by_id: contributor.id })
    .eq("review_id", reviewId)
    .in("id", ids);
  if (error) return { success: false, error: error.message };

  for (const row of rows as Array<{ reviewer_id?: string | null }>) {
    const reviewerId = String(row.reviewer_id ?? "").trim();
    if (reviewerId && reviewerId !== contributor.id) {
      await notifyReviewerChangeRequestCompleted({
        supabase,
        reviewId,
        reviewerId,
        actorName: contributor.name,
      });
    }
  }

  const { formatChangeRequestDisplayLabel } = await import(
    "@/lib/reviews/changeRequestNumbering"
  );
  for (const row of rows as Array<{
    id?: string;
    batch_number?: number | null;
    change_number?: number | null;
  }>) {
    const changeLabel =
      formatChangeRequestDisplayLabel(row.batch_number, row.change_number) ??
      "Change request";
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId,
      actorId: contributor.id,
      eventType: "change_request_closed",
      payload: {
        actor_name: contributor.name,
        change_request_id: String(row.id ?? ""),
        change_number: changeLabel.replace(/^Change\s+/i, ""),
        review_title: reviewTitle,
      },
    });
  }

  revalidatePath(`/reviews/${reviewId}`);
  return { success: true };
}

export async function reopenChangeRequestsAction(input: {
  reviewId: string;
  changeRequestIds: string[];
}): Promise<{ success: boolean; error?: string }> {
  const reviewId = String(input.reviewId ?? "").trim();
  const ids = Array.isArray(input.changeRequestIds)
    ? input.changeRequestIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!reviewId || ids.length === 0) {
    return { success: false, error: "Change request is required." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, project_id, creator_id, status, title")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { success: false, error: "Review not found." };
  const reviewStatus = normalizeLifecycleKey(
    String((review as Record<string, unknown>).status ?? ""),
  );
  if (reviewStatus === "complete") {
    return {
      success: false,
      error: "Reopen this review to manage change requests.",
    };
  }
  const reviewTitle = String((review as Record<string, unknown>).title ?? "Review");

  const projectId = String((review as Record<string, unknown>).project_id ?? "");
  const contributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined,
  );
  if (!contributor) {
    return { success: false, error: "No active contributor identity available." };
  }

  const { data: rows } = await supabase
    .from("change_requests")
    .select("id, reviewer_id, batch_number, change_number")
    .eq("review_id", reviewId)
    .in("id", ids);
  if (!rows?.length) {
    return { success: false, error: "Change request not found." };
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const isReviewCreator =
    String((review as Record<string, unknown>).creator_id ?? "").trim() !== "" &&
    String((review as Record<string, unknown>).creator_id ?? "").trim() ===
      String(authUser?.id ?? "").trim();
  const canEdit = canEditReviewDetails(contributor.permissionLevel ?? null);

  for (const row of rows as Array<{ reviewer_id?: string | null }>) {
    const reviewerId = String(row.reviewer_id ?? "").trim();
    const isOwner = reviewerId === contributor.id;
    if (!isOwner && !isReviewCreator && !canEdit) {
      return { success: false, error: "You cannot reopen this change request." };
    }
  }

  const { error } = await supabase
    .from("change_requests")
    .update({ completed_at: null, completed_by_id: null })
    .eq("review_id", reviewId)
    .in("id", ids);
  if (error) return { success: false, error: error.message };

  const { formatChangeRequestDisplayLabel } = await import(
    "@/lib/reviews/changeRequestNumbering"
  );
  for (const row of rows as Array<{
    id?: string;
    batch_number?: number | null;
    change_number?: number | null;
  }>) {
    const changeLabel =
      formatChangeRequestDisplayLabel(row.batch_number, row.change_number) ??
      "Change request";
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId,
      actorId: contributor.id,
      eventType: "change_requested",
      payload: {
        review_title: reviewTitle,
        review_id: reviewId,
        change_request_id: String(row.id ?? ""),
        change_ref: changeLabel.replace(/^Change\s+/i, ""),
        change_number: changeLabel.replace(/^Change\s+/i, ""),
        reopened: true,
        activity_summary: `reopened ${changeLabel} on ${reviewTitle}`,
      },
    });
  }

  revalidatePath(`/reviews/${reviewId}`);
  return { success: true };
}

export async function updateReviewLifecycleStatusAction(input: {
  reviewId: string;
  status: string;
}): Promise<{ success: boolean; error?: string }> {
  const reviewId = String(input.reviewId ?? "").trim();
  const next = String(input.status ?? "").trim();
  if (!reviewId) return { success: false, error: "Review is required." };
  if (!MANUAL_LIFECYCLE_STATUSES.has(normalizeLifecycleKey(next))) {
    return { success: false, error: "Invalid status." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, project_id, status, review_type, title")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { success: false, error: "Review not found." };

  const projectId = String((review as Record<string, unknown>).project_id ?? "");
  const reviewType = String((review as Record<string, unknown>).review_type ?? "");
  const reviewTitle = String((review as Record<string, unknown>).title ?? "Review");
  const contributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined
  );
  const gate = assertCanEditReview(contributor);
  if (!gate.ok) return { success: false, error: gate.error };

  const current = String((review as Record<string, unknown>).status ?? "draft");
  const transitionErr = lifecycleTransitionError(current, next, reviewType);
  if (transitionErr) {
    return { success: false, error: transitionErr };
  }

  const { error } = await supabase.from("reviews").update({ status: next }).eq("id", reviewId);
  if (error) {
    const schemaMessage = toSchemaCacheErrorMessage(error);
    if (schemaMessage) return { success: false, error: schemaMessage };
    return { success: false, error: error.message };
  }

  if (normalizeLifecycleKey(current) !== normalizeLifecycleKey(next)) {
    const currentNorm = normalizeLifecycleKey(current);
    const nextNorm = normalizeLifecycleKey(next);
    const reopenTarget = reopenReviewStatusForType(reviewType);
    const isReviewReopen = currentNorm === "complete" && nextNorm === reopenTarget;

    let openChangeRequestCount = 0;
    if (nextNorm === "complete") {
      const { count } = await supabase
        .from("change_requests")
        .select("id", { count: "exact", head: true })
        .eq("review_id", reviewId)
        .is("completed_at", null);
      openChangeRequestCount = count ?? 0;
    }

    await logTimelineEventServer(supabase, {
      projectId,
      reviewId,
      actorId: contributor?.id ?? null,
      eventType: "status_changed",
      payload: {
        review_title: reviewTitle,
        review_id: reviewId,
        review_type: reviewType,
        previous_status: current,
        new_status: next,
        from_status: current,
        to_status: next,
        status_transition_trigger: "manual",
        ...(isReviewReopen ? { review_reopened: true } : {}),
        ...(nextNorm === "complete"
          ? { open_change_request_count: openChangeRequestCount }
          : {}),
      },
    });
  }

  revalidatePath(`/reviews/${reviewId}`);
  return { success: true };
}

export async function markCompleteAction(
  reviewIdInput: string,
): Promise<{ success: boolean; error?: string }> {
  const reviewId = String(reviewIdInput ?? "").trim();
  if (!reviewId) return { success: false, error: "Review is required." };
  return updateReviewLifecycleStatusAction({ reviewId, status: "complete" });
}

export async function updateReviewBasicsAction(input: {
  reviewId: string;
  title: string;
  reviewFocus: string;
}): Promise<{ success: boolean; error?: string }> {
  const reviewId = String(input.reviewId ?? "").trim();
  if (!reviewId) return { success: false, error: "Review is required." };
  const title = String(input.title ?? "").trim();
  if (!title) return { success: false, error: "Title is required." };

  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, project_id")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { success: false, error: "Review not found." };

  const projectId = String((review as Record<string, unknown>).project_id ?? "");
  const contributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined
  );
  const gate = assertCanEditReview(contributor);
  if (!gate.ok) return { success: false, error: gate.error };

  const focus = String(input.reviewFocus ?? "").trim();
  const { error } = await supabase
    .from("reviews")
    .update({
      title,
      review_focus: focus || null,
    })
    .eq("id", reviewId);
  if (error) {
    const schemaMessage = toSchemaCacheErrorMessage(error);
    if (schemaMessage) return { success: false, error: schemaMessage };
    return { success: false, error: error.message };
  }

  revalidatePath(`/reviews/${reviewId}`);
  return { success: true };
}

export async function archiveReviewStubAction(input: {
  reviewId: string;
}): Promise<{ success: boolean; error?: string }> {
  const reviewId = String(input.reviewId ?? "").trim();
  if (!reviewId) return { success: false, error: "Review is required." };

  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, project_id")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { success: false, error: "Review not found." };

  const projectId = String((review as Record<string, unknown>).project_id ?? "");
  const contributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined
  );
  const gate = assertCanEditReview(contributor);
  if (!gate.ok) return { success: false, error: gate.error };

  void reviewId;
  return { success: true };
}

type RemovedArtifactLogInput = {
  id: string;
  title: string;
  linkUrl?: string | null;
};

type ArtifactDescriptionEditLogInput = {
  id: string;
  changeType: "title" | "description" | "version";
  artifactTitle: string;
  previousTitle?: string;
  previousVersion?: string;
  newVersion?: string;
};

const EDIT_REVIEW_TYPE_LABELS: Record<string, string> = {
  align: "Align",
  alignment: "Align",
  compare: "Compare",
  comparison: "Compare",
  critique: "Critique",
  approve: "Approve",
  approval: "Approve",
};

function editReviewTypeLabel(value: string | null | undefined): string {
  const key = String(value ?? "").trim().toLowerCase();
  return EDIT_REVIEW_TYPE_LABELS[key] ?? "Review";
}

export async function logEditReviewSaveEventsAction(input: {
  reviewId: string;
  projectId: string;
  reviewTitle: string;
  reviewType: string;
  previousTitle: string;
  newTitle: string;
  previousFocus: string;
  newFocus: string;
  previousReviewType: string;
  newReviewType: string;
  reviewTypeLocked: boolean;
  previousStatus: string;
  newStatus: string;
  removedArtifacts: RemovedArtifactLogInput[];
  artifactDescriptionEdits?: ArtifactDescriptionEditLogInput[];
}): Promise<{ success: boolean; error?: string }> {
  const reviewId = String(input.reviewId ?? "").trim();
  const projectId = String(input.projectId ?? "").trim();
  if (!reviewId || !projectId) {
    return { success: false, error: "Review is required." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, project_id")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { success: false, error: "Review not found." };

  const contributor = await getEffectiveCurrentContributor(supabase, projectId);
  const gate = assertCanEditReview(contributor);
  if (!gate.ok) return { success: false, error: gate.error };

  const createdAt = new Date().toISOString();
  const reviewTitle = String(input.newTitle ?? input.reviewTitle ?? "Review").trim() || "Review";
  const reviewType = String(input.reviewType ?? "").trim();
  const previousTitle = String(input.previousTitle ?? "").trim();
  const newTitle = String(input.newTitle ?? "").trim();
  const previousFocus = String(input.previousFocus ?? "").trim();
  const newFocus = String(input.newFocus ?? "").trim();
  const previousReviewType = String(input.previousReviewType ?? "").trim().toLowerCase();
  const newReviewType = String(input.newReviewType ?? "").trim().toLowerCase();
  const previousStatus = String(input.previousStatus ?? "").trim().toLowerCase();
  const newStatus = String(input.newStatus ?? "").trim().toLowerCase();

  const writeEvent = async (
    eventType: Parameters<typeof logTimelineEventServer>[1]["eventType"],
    payload: Record<string, unknown>,
  ) => {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId,
      actorId: contributor?.id ?? null,
      eventType,
      createdAt,
      payload: {
        review_id: reviewId,
        review_title: reviewTitle,
        ...payload,
      },
    });
  };

  if (previousTitle !== newTitle) {
    const actorName = String(contributor?.name ?? "").trim() || "A team member";
    await writeEvent("review_focus_edited", {
      edit_target: "Review title",
      tooltip_text: previousTitle || "Untitled",
      actor_name: actorName,
      previous_title: previousTitle,
      new_title: newTitle,
    });
  }

  if (previousFocus !== newFocus) {
    await writeEvent("review_focus_edited", {
      edit_target: "Review focus",
      tooltip_text: previousFocus || undefined,
    });
  }

  if (!input.reviewTypeLocked && previousReviewType && newReviewType && previousReviewType !== newReviewType) {
    await writeEvent("review_focus_edited", {
      edit_target: "Review type",
      tooltip_text: `${editReviewTypeLabel(previousReviewType)} → ${editReviewTypeLabel(newReviewType)}`,
      previous_review_type: previousReviewType,
      new_review_type: newReviewType,
    });
  }

  if (previousStatus && newStatus && previousStatus !== newStatus) {
    const actorName = String(contributor?.name ?? "").trim() || "A team member";
    if (newStatus === "paused") {
      await writeEvent("review_paused", {
        actor_name: actorName,
        previous_status: previousStatus,
      });
    } else if (previousStatus === "paused" && newStatus === "in-review") {
      await writeEvent("review_reactivated", {
        actor_name: actorName,
      });

      const { recipientIds } = await resolveReviewersNotifiedRecipients(supabase, reviewId);
      if (recipientIds.length > 0) {
        await sendReviewerNotificationEmails(supabase, {
          reviewId,
          reviewTitle,
          creatorName: actorName,
          reviewerIds: recipientIds,
        });

        const activityResult = await logReviewersNotifiedEvent(supabase, {
          projectId,
          reviewId,
          actorId: contributor?.id ?? null,
          actorName,
          trigger: "publish",
          recipientIds,
        });
        if (!activityResult.ok) {
          console.error(
            "[logEditReviewSaveEventsAction] reviewers_notified activity failed:",
            activityResult.error,
          );
        }
      }
    } else {
      await writeEvent("status_changed", {
        actor_name: actorName,
        new_status: newStatus,
        status_transition_trigger: "manual",
      });
    }
  }

  for (const artifact of input.removedArtifacts) {
    const artifactTitle = String(artifact.title ?? "").trim() || "Artifact";
    const linkUrl = artifact.linkUrl?.trim() || null;
    await writeEvent("artifact_deleted", {
      artifact_id: artifact.id,
      artifact_title: artifactTitle,
      artifact_url: linkUrl,
      activity_summary: `removed artifact "${artifactTitle}" from ${reviewTitle}`,
    });
  }

  const actorName = String(contributor?.name ?? "").trim() || "A team member";
  for (const edit of input.artifactDescriptionEdits ?? []) {
    const artifactTitle = String(edit.artifactTitle ?? "").trim() || "Artifact";
    const payload: Record<string, unknown> = {
      actor_name: actorName,
      artifact_title: artifactTitle,
      change_type: edit.changeType,
    };
    if (edit.changeType === "title") {
      payload.previous_title = String(edit.previousTitle ?? "").trim() || "Artifact";
    }
    if (edit.changeType === "version") {
      payload.previous_version = String(edit.previousVersion ?? "").trim() || "v1";
      payload.new_version = String(edit.newVersion ?? "").trim() || "v1";
    }
    await writeEvent("artifact_description_edited", payload);
  }

  revalidatePath(`/reviews/${reviewId}`);
  return { success: true };
}

export async function deleteReviewAction(
  reviewIdInput: string,
): Promise<{ success: boolean; error?: string; redirectTo?: string }> {
  const reviewId = String(reviewIdInput ?? "").trim();
  if (!reviewId) return { success: false, error: "Review is required." };

  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, project_id, status")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { success: false, error: "Review not found." };

  const projectId = String((review as Record<string, unknown>).project_id ?? "").trim();
  const status = String((review as Record<string, unknown>).status ?? "").trim();

  const contributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined,
  );
  const permission = normalizeWorkspacePermission(contributor?.permissionLevel ?? null);
  if (permission !== "admin") {
    return { success: false, error: "You do not have permission to delete this review." };
  }

  const { count, error: feedbackCountError } = await supabase
    .from("reviewer_feedback")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId)
    .eq("feedback_status", "submitted");
  if (feedbackCountError) {
    return { success: false, error: feedbackCountError.message };
  }

  if (!canDeleteReview(status, count ?? 0)) {
    return {
      success: false,
      error: "This review has feedback and can't be deleted. Archive coming soon.",
    };
  }

  const { error: deleteError } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (deleteError) {
    const schemaMessage = toSchemaCacheErrorMessage(deleteError);
    if (schemaMessage) return { success: false, error: schemaMessage };
    return { success: false, error: deleteError.message };
  }

  revalidatePath("/reviews");
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }

  return {
    success: true,
    redirectTo: projectId ? `/projects/${projectId}` : "/reviews",
  };
}

export async function publishReviewAction(
  reviewIdInput: string,
): Promise<{ error: string | null }> {
  const reviewId = String(reviewIdInput ?? "").trim();
  if (!reviewId) return { error: "Review is required." };

  const supabase = await createSupabaseServerClient();
  const { data: review, error: reviewError } = await supabase
    .from("reviews")
    .select(
      "id, project_id, title, status, review_type, owner_display_name, reviewer_contributor_ids",
    )
    .eq("id", reviewId)
    .maybeSingle();

  if (reviewError || !review) {
    return { error: "Review not found." };
  }

  const row = review as Record<string, unknown>;
  const projectId = String(row.project_id ?? "").trim();
  const reviewTitle = String(row.title ?? "Review").trim() || "Review";
  const reviewType = String(row.review_type ?? "");
  const currentStatus = String(row.status ?? "draft").trim().toLowerCase();

  if (currentStatus !== "draft") {
    return { error: "Only draft reviews can be published." };
  }

  const contributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined,
  );
  const gate = assertCanEditReview(contributor);
  if (!gate.ok) return { error: gate.error };

  const reviewerIds = Array.isArray(row.reviewer_contributor_ids)
    ? dedupeIds((row.reviewer_contributor_ids as unknown[]).map((id) => String(id)))
    : [];

  const { error: updateError } = await supabase
    .from("reviews")
    .update({
      status: "in-review",
      send_notification: true,
    })
    .eq("id", reviewId);

  if (updateError) {
    return { error: updateError.message };
  }

  const actorName =
    contributor?.name?.trim() ||
    String(row.owner_display_name ?? "").trim() ||
    "A teammate";

  await logTimelineEventServer(supabase, {
    projectId,
    reviewId,
    actorId: contributor?.id ?? null,
    eventType: "status_changed",
    payload: {
      review_title: reviewTitle,
      review_id: reviewId,
      review_type: reviewType,
      previous_status: "draft",
      new_status: "in-review",
      from_status: "draft",
      to_status: "in-review",
      status_transition_trigger: "manual",
    },
  });

  if (reviewerIds.length > 0) {
    await sendReviewerNotificationEmails(supabase, {
      reviewId,
      reviewTitle,
      creatorName: actorName,
      reviewerIds,
    });

    const activityResult = await logReviewersNotifiedEvent(supabase, {
      projectId,
      reviewId,
      actorId: contributor?.id ?? null,
      actorName,
      trigger: "publish",
      recipientIds: reviewerIds,
    });
    if (!activityResult.ok) {
      console.error(
        "[publishReviewAction] reviewers_notified activity failed:",
        activityResult.error,
      );
    }
  }

  revalidatePath(`/reviews/${reviewId}`);
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
  revalidatePath("/reviews");

  return { error: null };
}
