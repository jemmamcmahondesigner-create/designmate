'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectiveCurrentContributor } from '@/lib/auth/effectiveContributor';

export type DecisionStatus = 'approved' | 'changes-needed';

export interface SubmitDecisionInput {
  reviewId: string;
  decisionStatus: DecisionStatus;
  decisionComments: string;
  selectedArtifactIds?: string[];
  tradeOffNote?: string;
  /** Comparison reviews: when true, decision is recorded as changes-needed; otherwise approved. */
  hasChangeRequests?: boolean;
}

export async function submitDecisionAction(input: SubmitDecisionInput) {
  const reviewId = String(input.reviewId ?? '').trim();
  if (!reviewId) throw new Error('Review is required');

  const comments = String(input.decisionComments ?? '').trim();
  if (!comments) throw new Error('Decision comments are required');

  const supabase = await createSupabaseServerClient();
  const { data: review, error: reviewError } = await supabase
    .from('reviews')
    .select('id, project_id, review_type, reviewer_contributor_ids')
    .eq('id', reviewId)
    .maybeSingle();
  if (reviewError || !review) {
    throw new Error(reviewError?.message ?? 'Review not found');
  }

  const row = review as Record<string, unknown>;
  const projectId = String(row.project_id ?? '');
  const rawType = String(row.review_type ?? '').trim().toLowerCase();
  const normalizedType =
    rawType === 'comparison' ? 'compare' : rawType === 'approval' ? 'approve' : rawType;
  if (normalizedType !== 'compare' && normalizedType !== 'approve') {
    throw new Error('Decisions can only be recorded on comparison or approval reviews.');
  }

  const reviewerIds = Array.isArray(row.reviewer_contributor_ids)
    ? (row.reviewer_contributor_ids as unknown[]).map((id) => String(id)).filter(Boolean)
    : [];
  if (reviewerIds.length === 0) {
    throw new Error('This review has no assigned reviewers.');
  }

  const { data: feedbackRows, error: feedbackErr } = await supabase
    .from('reviewer_feedback')
    .select('reviewer_id, feedback_status')
    .eq('review_id', reviewId)
    .in('reviewer_id', reviewerIds);
  if (feedbackErr) {
    throw new Error(feedbackErr.message);
  }
  const submittedByReviewer = new Map<string, string>();
  for (const fr of feedbackRows ?? []) {
    const r = fr as Record<string, unknown>;
    const rid = String(r.reviewer_id ?? '');
    const st = String(r.feedback_status ?? '').trim().toLowerCase();
    if (rid) submittedByReviewer.set(rid, st);
  }
  const allFeedbackIn = reviewerIds.every(
    (id) => submittedByReviewer.get(id) === 'submitted',
  );
  if (!allFeedbackIn) {
    throw new Error('All reviewers must submit feedback before a decision can be recorded.');
  }

  const contributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined
  );

  let finalDecisionStatus: DecisionStatus = input.decisionStatus;
  if (normalizedType === 'compare') {
    finalDecisionStatus = input.hasChangeRequests ? 'changes-needed' : 'approved';
  }

  const selectedIds = Array.isArray(input.selectedArtifactIds)
    ? input.selectedArtifactIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const tradeOffNote = String(input.tradeOffNote ?? '').trim();
  const completedAt = new Date().toISOString();
  const { error } = await supabase
    .from('reviews')
    .update({
      // Persist narrative body as decision_comments (DecisionCard / review loader read this;
      // decision_selected_artifact_ids holds chosen artifact ids).
      decision_status: finalDecisionStatus,
      decision_made_at: completedAt,
      decision_owner_id: contributor?.id ?? null,
      decision_comments: comments,
      decision_selected_artifact_ids: selectedIds.length > 0 ? selectedIds : null,
      decision_trade_off_note: tradeOffNote || null,
      status: 'complete',
      completed_at: completedAt,
    })
    .eq('id', reviewId);
  if (error) {
    throw error;
  }

  revalidatePath(`/reviews/${reviewId}`);
  return { success: true as const };
}
