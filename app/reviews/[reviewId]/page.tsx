/**
 * Review Detail page (Server Component)
 *
 * Fetches the review row identified by the URL param from Supabase — along
 * with its artifacts jsonb, linked problem ids, and the parent project's
 * problem list — then hands everything to the client view. All interactivity
 * (scroll-spy, collapsible right-hand column, editable fields) lives in
 * `ReviewDetailView`, so this file stays a plain server component.
 *
 * Mode is derived from the query string: ?mode=view → view-only, else edit.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { getEffectiveCurrentContributor } from '@/lib/auth/effectiveContributor';
import { fetchContactDisplayNames } from '@/lib/contacts/fetchContactDisplayNames';
import { getDecisionMakerReviewerId } from '@/lib/reviews/workflow';
import { ReviewDetailView } from './ReviewDetailView';
import type {
  CardReplyRow,
  Problem,
  ReviewArtifact,
  ReviewChangeRequestEntry,
  ReviewerAssignment,
  ReviewerFeedbackEntry,
  Tradeoff,
} from './ReviewDetailView';

export const dynamic = 'force-dynamic';
const DEBUG_LOADER = process.env.NODE_ENV !== 'production';

// Supabase returns a to-one relation either as an object or (in looser
// inference scenarios) as a single-element array. Support both shapes.
type ProjectRelation =
  | { name: string | null }
  | Array<{ name: string | null }>
  | null;

function pickProjectName(rel: ProjectRelation): string {
  if (!rel) return 'Project';
  if (Array.isArray(rel)) return rel[0]?.name ?? 'Project';
  return rel.name ?? 'Project';
}

function parseReviewTradeoffsFromRow(raw: unknown): Tradeoff[] {
  if (!Array.isArray(raw)) return [];
  const out: Tradeoff[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const description = String(o.description ?? '').trim();
    const labelFallback = String(o.label ?? '').trim();
    const label = description || labelFallback || 'Tradeoff';
    const artifactLabelRaw = String(o.artifactLabel ?? '').trim();
    const rel = Array.isArray(o.relatedArtifactIds)
      ? (o.relatedArtifactIds as unknown[])
          .map((x) => String(x ?? '').trim())
          .filter(Boolean)
      : [];
    let severity: 'High' | 'Medium' | 'Low' = 'Medium';
    if (typeof o.severity === 'string') {
      const s = o.severity.trim().toLowerCase();
      if (s === 'high') severity = 'High';
      else if (s === 'low') severity = 'Low';
      else if (s === 'medium') severity = 'Medium';
    }
    out.push({
      id: String(o.id ?? `tradeoff-loaded-${i}`),
      label,
      severity,
      relatedArtifactIds: rel.length > 0 ? rel : undefined,
      artifactLabel: artifactLabelRaw || undefined,
    });
  });
  return out;
}

// ─── Artifact mapping ────────────────────────────────────────────────────────
// The `reviews.artifacts` jsonb is populated by the Create Review flow. Entries
// are either `{ kind: 'file', ... }` (uploaded files) or `{ kind: 'link', ... }`
// (Figma / external links). Older rows wrap the array as `{ artifacts: [...] }`,
// so we accept both shapes.

type RawArtifact = {
  url?: string;
  kind?: string;
  title?: string;
  mimeType?: string;
  iterationLabel?: string;
  description?: string;
  originalFileName?: string;
  /** Persisted AI provenance (optional snake_case or camelCase). */
  ai_generated?: boolean;
  aiGenerated?: boolean;
};

/** When `artifact_versions` rows exist for this review, overlay canonical name + v{n}. */
function applyArtifactVersionDisplay(
  base: ReviewArtifact[],
  fromDb: { version_number: number; artifact_name: string }[]
): ReviewArtifact[] {
  return base.map((a, i) => {
    const row = fromDb[i];
    if (!row || !row.artifact_name.trim()) return a;
    return {
      ...a,
      title: row.artifact_name,
      label: row.artifact_name,
      iteration: `v${row.version_number}`,
    };
  });
}

function mapArtifacts(raw: unknown): ReviewArtifact[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawArtifact[]).map((a, i) => {
    const mimeType = a.mimeType ?? '';
    const kind = a.kind ?? 'file';
    let type: 'Figma' | 'PDF' | 'Image' = 'Image';
    if (kind === 'link' && a.url?.includes('figma.com')) {
      type = 'Figma';
    } else if (mimeType === 'application/pdf') {
      type = 'PDF';
    }
    const titleRaw = a.title == null ? '' : String(a.title).trim();
    const title = titleRaw === '' ? null : titleRaw;
    const originalFileNameRaw =
      a.originalFileName == null ? '' : String(a.originalFileName).trim();
    const originalFileName =
      originalFileNameRaw === '' ? null : originalFileNameRaw;
    const aiGenerated = Boolean(a.ai_generated ?? a.aiGenerated);
    return {
      id: `artifact-${i}`,
      title,
      originalFileName,
      label: title ?? originalFileName ?? 'Untitled',
      type,
      iteration: a.iterationLabel ?? "v1",
      description: a.description ?? '',
      imageUrl: kind === 'file' ? (a.url ?? null) : null,
      linkUrl: kind === 'link' ? (a.url ?? null) : null,
      aiGenerated,
    };
  });
}

function extractArtifactArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const wrapper = (raw as { artifacts?: unknown }).artifacts;
    if (Array.isArray(wrapper)) return wrapper;
  }
  return [];
}

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: { reviewId: string };
  searchParams: { mode?: string };
}) {
  const mode = searchParams.mode === 'view' ? 'view-only' : 'edit';
  const supabase = await createSupabaseServerClient();
  if (DEBUG_LOADER) {
    console.info('[review-detail-loader] params', { reviewId: params.reviewId });
  }

  const { data: review, error: reviewError } = await supabase
    .from('reviews')
    .select(
      `
      id,
      title,
      status,
      created_at,
      review_focus,
      review_type,
      owner_display_name,
      decision_status,
      decision_made_at,
      decision_owner_id,
      decision_comments,
      decision_selected_artifact_ids,
      decision_trade_off_note,
      decision_trade_off_is_ai,
      decision_text,
      require_decision_maker,
      tradeoffs,
      project_id,
      related_problem_ids,
      reviewer_contributor_ids,
      artifacts,
      projects ( name )
    `
    )
    .eq('id', params.reviewId)
    .maybeSingle();
  if (DEBUG_LOADER) {
    console.info('[review-detail-loader] review-query', {
      error: reviewError?.message ?? null,
      hasRow: Boolean(review),
    });
  }

  if (reviewError || !review) {
    if (DEBUG_LOADER) {
      console.error('[review-detail-loader] base-review-load-failed', {
        error: reviewError?.message ?? null,
        code: reviewError?.code ?? null,
        hasRow: Boolean(review),
      });
    }
    return (
      <div style={{ padding: 32, color: '#6b5e55' }}>Review not found.</div>
    );
  }

  const row = review as unknown as {
    id: string;
    title: string | null;
    status: string | null;
    created_at: string | null;
    review_type: string | null;
    review_focus: string | null;
    require_decision_maker: boolean | null;
    owner_display_name: string | null;
    project_id: string | null;
    related_problem_ids: unknown;
    reviewer_contributor_ids: unknown;
    artifacts: unknown;
    decision_status: string | null;
    decision_made_at: string | null;
    decision_owner_id: string | null;
    decision_comments: string | null;
    decision_selected_artifact_ids: unknown;
    decision_trade_off_note: string | null;
    decision_trade_off_is_ai: boolean | null;
    decision_text: string | null;
    tradeoffs: unknown;
    projects: ProjectRelation;
  };

  const tradeoffs = parseReviewTradeoffsFromRow(row.tradeoffs);

  let artifacts = mapArtifacts(extractArtifactArray(row.artifacts));

  const { data: versionRows } = await supabase
    .from('artifact_versions')
    .select('version_number, created_at, artifacts ( name )')
    .eq('review_id', row.id)
    .order('created_at', { ascending: true });

  if (versionRows && versionRows.length > 0) {
    const enriched = versionRows.map((r: unknown) => {
      const o = r as Record<string, unknown>;
      const rel = o.artifacts as
        | { name?: string | null }
        | Array<{ name?: string | null }>
        | null;
      const name = Array.isArray(rel)
        ? rel[0]?.name
        : rel?.name;
      return {
        version_number: Number(o.version_number ?? 0),
        artifact_name: String(name ?? '').trim(),
      };
    });
    artifacts = applyArtifactVersionDisplay(artifacts, enriched);
  }

  const reviewerIdsEarly = Array.isArray(row.reviewer_contributor_ids)
    ? (row.reviewer_contributor_ids as unknown[]).map((id) => String(id))
    : [];
  const assignedDecisionMakerContributorId = getDecisionMakerReviewerId(
    row.review_type,
    reviewerIdsEarly
  );
  const contactNameMap = await fetchContactDisplayNames(supabase, [
    ...(row.decision_owner_id ? [String(row.decision_owner_id)] : []),
    ...(assignedDecisionMakerContributorId
      ? [assignedDecisionMakerContributorId]
      : []),
  ]);
  const contactDisplayById = Object.fromEntries(contactNameMap);

  const relatedProblemIds: string[] = Array.isArray(row.related_problem_ids)
    ? (row.related_problem_ids as unknown[]).map((id) => String(id))
    : [];

  let problems: Problem[] = [];
  let contributors: Array<{ id: string; name: string; role: string }> = [];
  let assignedReviewers: ReviewerAssignment[] = [];
  let feedbackEntries: ReviewerFeedbackEntry[] = [];
  let changeRequests: ReviewChangeRequestEntry[] = [];
  let cardReplies: CardReplyRow[] = [];
  let currentContributorId: string | null = null;
  let currentContributorRole: string | null = null;
  let currentContributorPermissionLevel: string | null = null;
  if (row.project_id) {
    const { data: problemsData } = await supabase
      .from('problems')
      .select('id, description')
      .eq('project_id', row.project_id)
      .order('created_at', { ascending: true });

    problems = (problemsData ?? []).map((p) => {
      const o = p as { id: unknown; description?: unknown };
      const id = String(o.id ?? '');
      return {
        id,
        text: String(o.description ?? ''),
        selected: relatedProblemIds.includes(id),
      };
    });

    const { data: contributorsData } = await supabase
      .from('contributors')
      .select('id, name, role, email')
      .eq('project_id', row.project_id)
      .order('created_at', { ascending: true });

    contributors = (contributorsData ?? []).map((c) => ({
      id: String((c as Record<string, unknown>).id ?? ''),
      name: String((c as Record<string, unknown>).name ?? ''),
      role: String((c as Record<string, unknown>).role ?? ''),
    }));

    try {
      const currentContributor = await getEffectiveCurrentContributor(
        supabase,
        row.project_id
      );
      currentContributorId = currentContributor?.id ?? null;
      currentContributorRole = currentContributor?.role ?? null;
      currentContributorPermissionLevel =
        currentContributor?.permissionLevel ?? null;
      if (DEBUG_LOADER) {
        console.info('[review-detail-loader] effective-contributor', {
          contributorId: currentContributorId,
          contributorRole: currentContributorRole,
        });
      }
    } catch (error) {
      if (DEBUG_LOADER) {
        console.warn('[review-detail-loader] effective-contributor-failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      currentContributorId = null;
    }

    const reviewerIds = reviewerIdsEarly;

    let reviewerContributors: Array<{
      id: string;
      name: string;
      role: string;
      email: string;
    }> = [];

    if (reviewerIds.length > 0) {
      const { data: reviewerData } = await supabase
        .from('contributors')
        .select('id, name, role, email')
        .in('id', reviewerIds);
      reviewerContributors = (reviewerData ?? []).map((c) => {
        const item = c as Record<string, unknown>;
        return {
          id: String(item.id ?? ''),
          name: String(item.name ?? ''),
          role: String(item.role ?? ''),
          email: String(item.email ?? ''),
        };
      });
    }

    const reviewerContributorById = new Map(
      reviewerContributors.map((c) => [c.id, c] as const)
    );

    const rt = String(row.review_type ?? '').trim().toLowerCase();
    const hasDecisionMakerFlow = rt === 'approve' || rt === 'compare';
    assignedReviewers = reviewerIds
      .map((reviewerId, index) => {
        const contributor = reviewerContributorById.get(reviewerId);
        if (!contributor) return null;
        const reviewRole =
          hasDecisionMakerFlow && index === 0
            ? 'Decision Maker'
            : 'Reviewer';
        return {
          id: contributor.id,
          name: contributor.name,
          role: reviewRole,
          isDecisionMaker: hasDecisionMakerFlow && index === 0,
        } satisfies ReviewerAssignment;
      })
      .filter((item): item is ReviewerAssignment => Boolean(item));

    const serviceSupabase = createServiceClient();
    const { data: feedbackRows, error: feedbackError } = await serviceSupabase
      .from('reviewer_feedback')
      .select(
        'id, reviewer_id, feedback_status, feedback_text, selected_option, feedback_submitted_at, reply_text, reply_by_id, reply_at, created_at'
      )
      .eq('review_id', row.id);
    if (feedbackError && DEBUG_LOADER) {
      console.warn('[review-detail-loader] feedback-query-failed', {
        message: feedbackError.message,
        code: feedbackError.code ?? null,
      });
    }
    if (DEBUG_LOADER) {
      console.info('[review-detail-loader] feedback-query', {
        rows: feedbackRows?.length ?? 0,
      });
    }
    const rowsByReviewer = new Map<string, Record<string, unknown>[]>();
    for (const item of feedbackRows ?? []) {
      const data = item as Record<string, unknown>;
      const reviewerId = String(data.reviewer_id ?? '');
      if (!reviewerId) continue;
      const list = rowsByReviewer.get(reviewerId) ?? [];
      list.push(data);
      rowsByReviewer.set(reviewerId, list);
    }

    const assignedById = new Map(
      assignedReviewers.map((reviewer) => [reviewer.id, reviewer] as const)
    );
    const contributorById = new Map(
      contributors.map((contributor) => [contributor.id, contributor] as const)
    );
    // Only reviewers explicitly assigned on this review — ignore orphan
    // reviewer_feedback rows (e.g. stale data or wrong review_id).
    const reviewerIdsForFeedback = [...new Set(reviewerIds)];
    feedbackEntries = reviewerIdsForFeedback.flatMap((reviewerId) => {
      const assigned = assignedById.get(reviewerId);
      const contributor = contributorById.get(reviewerId);
      const reviewerName = assigned?.name ?? contributor?.name ?? 'Reviewer';
      const reviewerRole = assigned?.role ?? contributor?.role ?? '';
      const rows = rowsByReviewer.get(reviewerId) ?? [];
      if (rows.length === 0) {
        return [
          {
            feedbackId: null,
            reviewerId,
            reviewerName,
            reviewerRole,
            status: 'pending',
            feedbackText: null,
            selectedOption: null,
            submittedAt: null,
            replyText: null,
            replyById: null,
            replyAt: null,
            requestedAt: null,
          } satisfies ReviewerFeedbackEntry,
        ];
      }
      rows.sort(
        (a, b) =>
          new Date(String(a.created_at ?? 0)).getTime() -
          new Date(String(b.created_at ?? 0)).getTime()
      );
      return rows.map((feedback) => {
        const rawStatus = String(feedback.feedback_status ?? '');
        const status: ReviewerFeedbackEntry['status'] =
          rawStatus === 'submitted' ? 'submitted' : 'pending';
        return {
          feedbackId: feedback.id == null ? null : String(feedback.id),
          reviewerId,
          reviewerName,
          reviewerRole,
          status,
          feedbackText:
            feedback.feedback_text == null ? null : String(feedback.feedback_text),
          selectedOption:
            feedback.selected_option == null ? null : String(feedback.selected_option),
          submittedAt:
            feedback.feedback_submitted_at == null
              ? null
              : String(feedback.feedback_submitted_at),
          replyText:
            feedback.reply_text == null ? null : String(feedback.reply_text),
          replyById:
            feedback.reply_by_id == null ? null : String(feedback.reply_by_id),
          replyAt: feedback.reply_at == null ? null : String(feedback.reply_at),
          requestedAt:
            feedback.created_at == null ? null : String(feedback.created_at),
        } satisfies ReviewerFeedbackEntry;
      });
    });

    const { data: changeRequestsData } = await supabase
      .from('change_requests')
      .select(
        'id, reviewer_id, artifact_ids, changes_needed, reply_text, reply_by_id, reply_at, created_at, batch_id'
      )
      .eq('review_id', row.id)
      .order('created_at', { ascending: false });
    changeRequests = (changeRequestsData ?? []).map((item) => {
      const data = item as Record<string, unknown>;
      return {
        id: String(data.id ?? ''),
        reviewer_id: data.reviewer_id == null ? null : String(data.reviewer_id),
        artifact_ids: Array.isArray(data.artifact_ids)
          ? data.artifact_ids.map((value) => String(value))
          : [],
        changes_needed: data.changes_needed == null ? null : String(data.changes_needed),
        reply_text: data.reply_text == null ? null : String(data.reply_text),
        reply_by_id: data.reply_by_id == null ? null : String(data.reply_by_id),
        reply_at: data.reply_at == null ? null : String(data.reply_at),
        created_at: String(data.created_at ?? ''),
        batch_id: data.batch_id == null ? null : String(data.batch_id),
      } satisfies ReviewChangeRequestEntry;
    });

    const cardIds = [
      ...(feedbackRows ?? [])
        .map((row) => String((row as Record<string, unknown>).id ?? ''))
        .filter(Boolean),
      ...changeRequests.map((cr) => cr.id),
    ];
    if (cardIds.length > 0) {
      const { data: cardRepliesData } = await supabase
        .from('card_replies')
        .select('id, card_type, card_id, reply_text, reply_by_id, created_at')
        .in('card_id', cardIds)
        .order('created_at', { ascending: true });
      cardReplies = (cardRepliesData ?? []).map((item) => {
        const data = item as Record<string, unknown>;
        const ct = String(data.card_type ?? '');
        const cardType: CardReplyRow['card_type'] =
          ct === 'change_request' ? 'change_request' : 'feedback';
        return {
          id: String(data.id ?? ''),
          card_type: cardType,
          card_id: String(data.card_id ?? ''),
          reply_text: String(data.reply_text ?? ''),
          reply_by_id: data.reply_by_id == null ? null : String(data.reply_by_id),
          created_at: String(data.created_at ?? ''),
        } satisfies CardReplyRow;
      });
    }
  }

  return (
    <ReviewDetailView
      reviewId={row.id}
      title={row.title ?? 'Untitled Review'}
      status={row.status ?? 'draft'}
      reviewType={row.review_type ?? ''}
      reviewFocus={row.review_focus ?? ''}
      projectId={row.project_id ?? ''}
      projectName={pickProjectName(row.projects)}
      mode={mode}
      artifacts={artifacts}
      problems={problems}
      contributors={contributors}
      assignedReviewers={assignedReviewers}
      feedbackEntries={feedbackEntries}
      changeRequests={changeRequests}
      cardReplies={cardReplies}
      currentContributorId={currentContributorId}
      currentContributorRole={currentContributorRole}
      currentContributorPermissionLevel={currentContributorPermissionLevel}
      requireDecisionMaker={row.require_decision_maker ?? false}
      decisionMakerId={row.decision_owner_id}
      contactDisplayById={contactDisplayById}
      reviewOwnerName={row.owner_display_name ?? null}
      reviewCreatedAt={row.created_at}
      decision={{
        status: row.decision_status,
        // Canonical body from submitDecisionAction is decision_comments; decision_text is legacy-only.
        text: row.decision_comments ?? row.decision_text ?? null,
        madeAt: row.decision_made_at,
        ownerId: row.decision_owner_id,
        selectedArtifactIds: Array.isArray(row.decision_selected_artifact_ids)
          ? (row.decision_selected_artifact_ids as unknown[]).map((id) => String(id))
          : [],
        tradeOffNote: row.decision_trade_off_note ?? null,
        tradeOffIsAI: row.decision_trade_off_is_ai ?? null,
      }}
      activeTabIndex={0}
      tradeoffs={tradeoffs}
    />
  );
}
