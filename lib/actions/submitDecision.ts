'use server';

import { revalidatePath } from 'next/cache';
import { getEffectiveCurrentContributor } from '@/lib/auth/effectiveContributor';
import {
  changeRequestMatchesSelection,
  expandArtifactSelectionKeys,
  type ArtifactSelectionSource,
} from '@/lib/reviews/artifactSelectionMatch';
import { resolveBatchStartForNewSubmission } from '@/lib/reviews/changeRequestNumbering';
import { notifyCreatorDecisionRecorded } from '@/lib/reviews/notify-review-creator';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logTimelineEventServer } from '@/lib/timeline/logEventServer';

export type DecisionStatus = 'approved' | 'changes-needed';

export type DecisionChangeRequestDraft = {
  artifactIds: string[];
  changesNeeded: string;
};

export interface SubmitDecisionInput {
  reviewId: string;
  decisionStatus: DecisionStatus;
  decisionComments: string;
  selectedArtifactIds?: string[];
  tradeOffNote?: string;
  hasChangeRequests?: boolean;
  changeDirection?: boolean;
  /** New change requests added in Final Decision drawer (compare). */
  decisionChangeRequests?: DecisionChangeRequestDraft[];
}

function formatArtifactNameList(names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`;
}

function labelsForArtifactIds(
  ids: string[],
  artifactList: ArtifactSelectionSource[],
): string[] {
  const keys = expandArtifactSelectionKeys(ids, artifactList);
  const labels: string[] = [];
  for (const artifact of artifactList) {
    const id = String(artifact.id ?? '').trim();
    const title = String(artifact.title ?? artifact.label ?? '').trim();
    const label = String(artifact.label ?? artifact.title ?? '').trim();
    if (keys.has(id) || (title && keys.has(title)) || (label && keys.has(label))) {
      labels.push(label || title || id);
    }
  }
  if (labels.length === 0 && ids.length > 0) {
    return ids.map((id) => {
      const match = artifactList.find((a) => String(a.id) === id);
      return match?.title ?? match?.label ?? id;
    });
  }
  return labels;
}

function parseArtifactList(raw: unknown): ArtifactSelectionSource[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return { id: `artifact-${index}`, title: 'Untitled', label: 'Untitled' };
    }
    const art = item as Record<string, unknown>;
    const title = art.title == null ? null : String(art.title);
    const id = art.id == null ? `artifact-${index}` : String(art.id);
    const label =
      String(title ?? art.originalFileName ?? 'Untitled').trim() || 'Untitled';
    return { id, title, label };
  });
}

function normalizePriorArtifactIds(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.map((value) => String(value).trim()).filter(Boolean)
    : [];
}

export async function submitDecisionAction(input: SubmitDecisionInput) {
  const reviewId = String(input.reviewId ?? '').trim();
  if (!reviewId) throw new Error('Review is required');

  const comments = String(input.decisionComments ?? '').trim();
  if (!comments) throw new Error('Decision comments are required');

  const supabase = await createSupabaseServerClient();
  const { data: review, error: reviewError } = await supabase
    .from('reviews')
    .select(
      'id, project_id, review_type, reviewer_contributor_ids, artifacts, status, title, decision_selected_artifact_ids',
    )
    .eq('id', reviewId)
    .maybeSingle();
  if (reviewError || !review) {
    throw new Error(reviewError?.message ?? 'Review not found');
  }

  const row = review as Record<string, unknown>;
  const projectId = String(row.project_id ?? '');
  const reviewTitle = String(row.title ?? 'Review');
  const previousReviewStatus = String(row.status ?? 'draft');
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

  const decisionMakerId = reviewerIds[0] ?? '';
  const isSingleReviewerCompare =
    normalizedType === 'compare' && reviewerIds.length === 1;
  const isChangeDirection =
    normalizedType === 'compare' &&
    input.changeDirection === true &&
    previousReviewStatus.trim().toLowerCase() === 'approved';

  const { data: feedbackRows, error: feedbackErr } = await supabase
    .from('reviewer_feedback')
    .select('reviewer_id, feedback_status')
    .eq('review_id', reviewId)
    .in('reviewer_id', reviewerIds);
  if (feedbackErr) throw new Error(feedbackErr.message);

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
  if (!allFeedbackIn && !isChangeDirection && !isSingleReviewerCompare) {
    throw new Error('All reviewers must submit feedback before a decision can be recorded.');
  }

  const contributor = await getEffectiveCurrentContributor(
    supabase,
    projectId || undefined,
  );
  if (!contributor) throw new Error('No active contributor identity available.');

  if (normalizedType === 'compare' && contributor.id !== decisionMakerId) {
    throw new Error('Only the decision maker can submit the final decision.');
  }

  const selectedIds = Array.isArray(input.selectedArtifactIds)
    ? input.selectedArtifactIds.map((id) => String(id).trim()).filter(Boolean)
    : [];

  const artifactList = parseArtifactList(row.artifacts);
  const conceptLabels = labelsForArtifactIds(selectedIds, artifactList);
  const conceptLabel = formatArtifactNameList(conceptLabels) || 'the selected direction';

  const draftChangeRequests = Array.isArray(input.decisionChangeRequests)
    ? input.decisionChangeRequests
        .map((cr) => ({
          artifactIds: (cr.artifactIds ?? []).map((id) => String(id).trim()).filter(Boolean),
          changesNeeded: String(cr.changesNeeded ?? '').trim(),
        }))
        .filter((cr) => cr.artifactIds.length > 0)
    : [];

  if (normalizedType === 'compare' && draftChangeRequests.length > 0) {
    const batchStart = await resolveBatchStartForNewSubmission(supabase, reviewId);
    let changeIndex = 0;

    for (const cr of draftChangeRequests) {
      const changeNumber = batchStart.startChangeNumber + changeIndex;
      await supabase.from('change_requests').insert({
        review_id: reviewId,
        reviewer_id: decisionMakerId,
        artifact_ids: cr.artifactIds,
        changes_needed: cr.changesNeeded || null,
        batch_id: batchStart.batchId,
        batch_number: batchStart.batchNumber,
        change_number: changeNumber,
      });
      changeIndex += 1;
    }
  }

  let reviewerChangeRequestsOnSelection = false;
  if (normalizedType === 'compare') {
    const selectionKeys = expandArtifactSelectionKeys(selectedIds, artifactList);
    if (selectionKeys.size > 0) {
      const { data: changeRequestRows, error: changeRequestErr } = await supabase
        .from('change_requests')
        .select('artifact_ids')
        .eq('review_id', reviewId);
      if (changeRequestErr) throw new Error(changeRequestErr.message);
      reviewerChangeRequestsOnSelection = (changeRequestRows ?? []).some((crRow) => {
        const cr = crRow as Record<string, unknown>;
        const artifactIds = Array.isArray(cr.artifact_ids)
          ? cr.artifact_ids.map((value) => String(value).trim()).filter(Boolean)
          : [];
        return changeRequestMatchesSelection(artifactIds, selectionKeys);
      });
    }
  }

  const hasAnyChangeRequests =
    Boolean(input.hasChangeRequests) ||
    draftChangeRequests.length > 0 ||
    reviewerChangeRequestsOnSelection;

  const finalDecisionStatus: DecisionStatus =
    normalizedType === 'compare'
      ? hasAnyChangeRequests
        ? 'changes-needed'
        : 'approved'
      : input.decisionStatus;

  const tradeOffNote = String(input.tradeOffNote ?? '').trim();
  const completedAt = new Date().toISOString();
  const nextReviewStatus = isChangeDirection
    ? 'approved'
    : normalizedType === 'compare'
      ? 'approved'
      : 'complete';

  const priorSelectedIds = normalizePriorArtifactIds(row.decision_selected_artifact_ids);
  const priorConceptLabels = labelsForArtifactIds(priorSelectedIds, artifactList);
  const priorConceptLabel =
    formatArtifactNameList(priorConceptLabels) || 'the previous direction';

  const { error } = await supabase
    .from('reviews')
    .update({
      decision_status: finalDecisionStatus,
      decision_made_at: completedAt,
      decision_owner_id: contributor.id,
      decision_comments: comments,
      decision_selected_artifact_ids: selectedIds.length > 0 ? selectedIds : null,
      decision_trade_off_note: tradeOffNote || null,
      status: nextReviewStatus,
      ...(normalizedType === 'approve' && !isChangeDirection
        ? { completed_at: completedAt }
        : {}),
    })
    .eq('id', reviewId);
  if (error) throw error;

  if (isChangeDirection) {
    await supabase
      .from('review_decision_snapshots')
      .update({ superseded_at: completedAt })
      .eq('review_id', reviewId)
      .eq('entry_role', 'approval')
      .is('superseded_at', null);
  }

  const snapshotRows: Array<Record<string, unknown>> = [];

  if (normalizedType === 'compare' && hasAnyChangeRequests) {
    let crSummary =
      draftChangeRequests.length > 0
        ? draftChangeRequests
            .map((cr) => cr.changesNeeded)
            .filter(Boolean)
            .join('\n\n')
        : '';
    if (!crSummary) {
      const { data: existingCrRows } = await supabase
        .from('change_requests')
        .select('changes_needed, created_at')
        .eq('review_id', reviewId)
        .order('created_at', { ascending: true });
      crSummary = (existingCrRows ?? [])
        .map((row) => String((row as Record<string, unknown>).changes_needed ?? '').trim())
        .filter(Boolean)
        .join('\n\n');
    }
    if (!crSummary) {
      crSummary = 'Changes requested on the selected direction.';
    }
    snapshotRows.push({
      review_id: reviewId,
      decision_status: 'changes-needed',
      decision_comments: crSummary,
      decision_selected_artifact_ids: selectedIds.length > 0 ? selectedIds : null,
      decision_owner_id: contributor.id,
      decision_made_at: completedAt,
      entry_role: 'change_request',
    });
  }

  snapshotRows.push({
    review_id: reviewId,
    decision_status: finalDecisionStatus === 'changes-needed' ? 'approved' : finalDecisionStatus,
    decision_comments: comments,
    decision_selected_artifact_ids: selectedIds.length > 0 ? selectedIds : null,
    decision_owner_id: contributor.id,
    decision_made_at: completedAt,
    entry_role: 'approval',
  });

  for (const snapshot of snapshotRows) {
    await supabase.from('review_decision_snapshots').insert(snapshot);
  }

  if (normalizedType === 'compare') {
    if (isChangeDirection) {
      await logTimelineEventServer(supabase, {
        projectId,
        reviewId,
        actorId: contributor.id,
        eventType: 'concept_selected',
        payload: {
          concept_name: conceptLabel,
          previous_concept_name: priorConceptLabel,
          review_title: reviewTitle,
          review_id: reviewId,
          review_type: 'compare',
          selection_stage: 'direction_update',
        },
      });
      if (hasAnyChangeRequests) {
        await logTimelineEventServer(supabase, {
          projectId,
          reviewId,
          actorId: contributor.id,
          eventType: 'change_requested',
          payload: {
            review_title: reviewTitle,
            review_id: reviewId,
            review_type: 'compare',
            artifact_name: conceptLabel,
            activity_summary: `${contributor.name} requested changes on ${conceptLabel}`,
          },
        });
      }
    } else {
      await logTimelineEventServer(supabase, {
        projectId,
        reviewId,
        actorId: contributor.id,
        eventType: 'concept_selected',
        payload: {
          concept_name: conceptLabel,
          review_title: reviewTitle,
          review_id: reviewId,
          review_type: 'compare',
          selection_stage: 'approved_direction',
        },
      });
      if (hasAnyChangeRequests) {
        await logTimelineEventServer(supabase, {
          projectId,
          reviewId,
          actorId: contributor.id,
          eventType: 'change_requested',
          payload: {
            review_title: reviewTitle,
            review_id: reviewId,
            review_type: 'compare',
            artifact_name: conceptLabel,
            activity_summary: `${contributor.name} requested changes on ${conceptLabel}`,
          },
        });
      }
    }
  }

  if (
    !isChangeDirection &&
    previousReviewStatus.trim().toLowerCase() !== nextReviewStatus
  ) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId,
      actorId: contributor.id,
      eventType: 'status_changed',
      payload: {
        review_title: reviewTitle,
        review_id: reviewId,
        review_type: normalizedType,
        previous_status: previousReviewStatus,
        new_status: nextReviewStatus,
        from_status: previousReviewStatus,
        to_status: nextReviewStatus,
        status_transition_trigger: 'auto',
      },
    });
  }

  await notifyCreatorDecisionRecorded(supabase, {
    reviewId,
    decisionStatus: finalDecisionStatus,
    decisionText: comments,
    tradeOffNote: tradeOffNote || null,
    decisionOwnerId: contributor.id,
  });

  revalidatePath(`/reviews/${reviewId}`);
  return { success: true as const };
}
