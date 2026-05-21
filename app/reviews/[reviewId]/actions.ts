"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEffectiveCurrentContributor } from "@/lib/auth/effectiveContributor";
import {
  notifyReviewNeedsAttention,
  notifyReviewersAssigned,
} from "@/lib/notifications/reviews";
import { logTimelineEventServer } from "@/lib/timeline/logEventServer";
import { notifyCreatorFeedbackSubmitted } from "@/lib/reviews/notify-review-creator";
import { canEditReviewDetails } from "@/lib/reviews/workflow";
import { EDIT_REVIEW_DENIED_MESSAGE } from "@/lib/workspace/permissions";
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

export async function assignReviewersAction(input: {
  reviewId: string;
  reviewerIds: string[];
  requireDecisionMaker: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, project_id, reviewer_contributor_ids, review_type, decision_owner_id")
    .eq("id", input.reviewId)
    .maybeSingle();
  if (!review) {
    return { error: "Review not found." };
  }

  const reviewRow = review as Record<string, unknown>;
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

  const { error: reviewUpdateError } = await supabase
    .from("reviews")
    .update({
      reviewer_contributor_ids: nextIds,
      ...(shouldSetDecisionOwner ? { decision_owner_id: nextIds[0] } : {}),
    })
    .eq("id", input.reviewId);
  if (reviewUpdateError) {
    return { error: reviewUpdateError.message };
  }

  if (nextIds.length > 0) {
    const rows = nextIds.map((reviewerId) => ({
      review_id: input.reviewId,
      reviewer_id: reviewerId,
      feedback_status: "pending",
    }));
    const { error: upsertError } = await supabase
      .from("reviewer_feedback")
      .upsert(rows, { onConflict: "review_id,reviewer_id" });
    if (upsertError) {
      console.error("[assignReviewers-upsert-error]", upsertError);
      const schemaMessage = toSchemaCacheErrorMessage(upsertError);
      if (schemaMessage) return { error: schemaMessage };
      return { error: upsertError.message };
    }
  }

  if (newlyAddedIds.length > 0) {
    const currentContributor = await getEffectiveCurrentContributor(
      supabase,
      projectId || undefined
    );
    await notifyReviewersAssigned({
      reviewId: input.reviewId,
      reviewerIds: newlyAddedIds,
      triggeredByContributorId: currentContributor?.id ?? null,
    });
    const { data: addedContributors } = await supabase
      .from("contributors")
      .select("id, name")
      .in("id", newlyAddedIds);
    for (const contributor of addedContributors ?? []) {
      const c = contributor as Record<string, unknown>;
      await logTimelineEventServer(supabase, {
        projectId,
        reviewId: input.reviewId,
        actorId: currentContributor?.id ?? null,
        eventType: "reviewer_added",
        payload: {
          reviewer_name: String(c.name ?? "Reviewer")
        }
      });
    }
  }

  revalidatePath(`/reviews/${input.reviewId}`);
  return { error: null };
}

export async function createTeammateFromReviewAction(input: {
  reviewId: string;
  projectId: string;
  name: string;
  email: string | null;
  role: string | null;
  requireDecisionMaker: boolean;
  includeInWorkspace?: boolean;
}): Promise<{ error: string | null }> {
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

  return { error: null };
}

export async function removeReviewerAction(input: {
  reviewId: string;
  reviewerContributorId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("id, reviewer_contributor_ids")
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

  revalidatePath(`/reviews/${input.reviewId}`);
  return { error: null };
}

export async function submitReviewerFeedbackAction(input: {
  reviewId: string;
  reviewerId?: string;
  feedbackType?: string;
  selectedArtifactIds?: string[];
  feedbackText?: string;
  feedbackLocation?: string;
}) {
  if (
    !input.feedbackText?.trim() &&
    !input.selectedArtifactIds?.length &&
    !input.feedbackLocation
  ) {
    return { success: false, error: "Feedback content is required" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: review } = await supabase
    .from("reviews")
    .select("project_id, reviewer_contributor_ids, review_type, title, status")
    .eq("id", input.reviewId)
    .maybeSingle();
  if (!review) return { error: "Review not found." };

  const projectId = String((review as Record<string, unknown>).project_id ?? "");
  const reviewerIds = Array.isArray(
    (review as Record<string, unknown>).reviewer_contributor_ids
  )
    ? ((review as Record<string, unknown>).reviewer_contributor_ids as unknown[]).map(
        (id) => String(id)
      )
    : [];
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
  if (input.reviewerId && input.reviewerId !== currentContributor.id) {
    return { error: "Reviewer identity mismatch." };
  }
  if (!reviewerIds.includes(currentContributor.id)) {
    return { error: "Only assigned reviewers can submit feedback." };
  }

  const feedbackText = String(input.feedbackText ?? "").trim();
  const selectedArtifactIds = Array.isArray(input.selectedArtifactIds)
    ? input.selectedArtifactIds.map((id) => String(id)).filter(Boolean)
    : [];
  const feedbackLocation = String(input.feedbackLocation ?? "").trim();
  const feedbackType = String(input.feedbackType ?? "").trim().toLowerCase();
  const hasAnySelectedArtifacts = selectedArtifactIds.length > 0;
  const hasFeedbackText = feedbackText.length > 0;
  const hasFeedbackLocation = feedbackLocation.length > 0;

  if (feedbackType === "compare") {
    if (!hasAnySelectedArtifacts || !hasFeedbackText) {
      return {
        error: "Comparison feedback requires a selected artifact and written feedback.",
      };
    }
  } else if (feedbackType === "approve") {
    if (!hasAnySelectedArtifacts) {
      return {
        error: "Approve feedback requires approved artifacts.",
      };
    }
  } else if (feedbackType === "align") {
    if (!hasFeedbackText) {
      return {
        error: "Align feedback requires comments.",
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
  if (!effectiveFeedbackText && !selectedOptionValue) {
    return { error: "Feedback cannot be empty." };
  }

  const feedbackPayload = {
    review_id: input.reviewId,
    reviewer_id: currentContributor.id,
    feedback_status: "submitted",
    feedback_text: effectiveFeedbackText || null,
    selected_option: selectedOptionValue,
    feedback_submitted_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("reviewer_feedback").upsert(feedbackPayload, {
    onConflict: "review_id,reviewer_id",
  });
  if (error) {
    const schemaMessage = toSchemaCacheErrorMessage(error);
    if (schemaMessage) return { error: schemaMessage };
    return { error: error.message };
  }

  await supabase.from("review_activity").insert({
    review_id: input.reviewId,
    contributor_id: currentContributor.id,
    activity_type: "feedback_submitted",
    metadata: {
      review_type: normalizedReviewType,
      feedback_type: feedbackType || null,
    },
  });
  // TODO(activity-tab): wire Activity tab to read from `review_activity`.

  if (reviewerIds.length > 0) {
    const { data: feedbackRows } = await supabase
      .from("reviewer_feedback")
      .select("reviewer_id, feedback_status")
      .eq("review_id", input.reviewId)
      .in("reviewer_id", reviewerIds);

    const submittedByReviewerId = new Map<string, boolean>();
    for (const row of feedbackRows ?? []) {
      const data = row as Record<string, unknown>;
      const reviewerId = String(data.reviewer_id ?? "");
      const status = String(data.feedback_status ?? "").trim().toLowerCase();
      if (!reviewerId) continue;
      submittedByReviewerId.set(reviewerId, status === "submitted");
    }

    const allSubmitted = reviewerIds.every(
      (reviewerId) => submittedByReviewerId.get(reviewerId) === true
    );
    const prevNorm = previousReviewStatus.trim().toLowerCase();
    const skipAutoFeedbackSubmitted =
      prevNorm === "complete" || prevNorm === "feedback-submitted";
    if (allSubmitted && !skipAutoFeedbackSubmitted) {
      await supabase
        .from("reviews")
        .update({ status: "feedback-submitted" })
        .eq("id", input.reviewId);
      await logTimelineEventServer(supabase, {
        projectId,
        reviewId: input.reviewId,
        actorId: currentContributor.id,
        eventType: "status_changed",
        payload: {
          review_title: reviewTitle,
          review_id: input.reviewId,
          from_status: previousReviewStatus,
          to_status: "feedback-submitted"
        }
      });
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

  await logTimelineEventServer(supabase, {
    projectId,
    reviewId: input.reviewId,
    actorId: currentContributor.id,
    eventType: "feedback_provided",
    payload: {
      review_title: reviewTitle,
      review_id: input.reviewId,
      review_type: normalizedReviewType
    }
  });

  await notifyCreatorFeedbackSubmitted(supabase, {
    reviewId: input.reviewId,
    reviewerId: currentContributor.id,
    reviewerName: currentContributor.name,
    feedbackText: effectiveFeedbackText || null,
  });

  if (
    (normalizedReviewType === "compare" || normalizedReviewType === "comparison") &&
    selectedArtifactIds.length > 0
  ) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: input.reviewId,
      actorId: currentContributor.id,
      eventType: "concept_selected",
      payload: {
        concept_name: selectedArtifactIds[0],
        review_title: reviewTitle,
        review_id: input.reviewId,
        review_type: "comparison",
        selection_stage: "preference"
      }
    });
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

  const { error } = await supabase.from("change_requests").insert({
    review_id: input.reviewId,
    reviewer_id: input.reviewerId,
    artifact_ids: artifactIdentifiers,
    changes_needed: String(input.changesNeeded ?? "").trim() || null,
    batch_id: input.batchId?.trim() || null,
  });
  if (error) {
    const schemaMessage = toSchemaCacheErrorMessage(error);
    if (schemaMessage) return { error: schemaMessage };
    return { error: error.message };
  }

  const { data: review } = await supabase
    .from("reviews")
    .select("project_id, title, review_type")
    .eq("id", input.reviewId)
    .maybeSingle();
  const reviewRow = (review ?? {}) as Record<string, unknown>;
  await logTimelineEventServer(supabase, {
    projectId: String(reviewRow.project_id ?? ""),
    reviewId: input.reviewId,
    actorId: input.reviewerId,
    eventType: "changes_requested",
    payload: {
      review_title: String(reviewRow.title ?? "Review"),
      review_id: input.reviewId,
      artifact_name: input.artifactIds[0] ?? "",
      review_type: String(reviewRow.review_type ?? "")
    }
  });

  revalidatePath(`/reviews/${input.reviewId}`);
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

  if (n === "complete") {
    if (rt === "compare" || rt === "approve") {
      return "Complete is set automatically when a decision is recorded.";
    }
    if (rt !== "critique" && rt !== "align") {
      return "That status cannot be set manually.";
    }
    if (c !== "feedback-submitted") {
      return "Complete can only be set from Feedback Submitted for this review type.";
    }
    return null;
  }

  if (n === "paused") {
    if (c === "draft" || c === "in-review") return null;
    return "Paused can only be set from Draft or In Review.";
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
    .select("id, project_id, status, review_type")
    .eq("id", reviewId)
    .maybeSingle();
  if (!review) return { success: false, error: "Review not found." };

  const projectId = String((review as Record<string, unknown>).project_id ?? "");
  const reviewType = String((review as Record<string, unknown>).review_type ?? "");
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

  revalidatePath(`/reviews/${reviewId}`);
  return { success: true };
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
