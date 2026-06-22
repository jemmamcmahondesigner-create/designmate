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
import { getDevImpersonatedContributorId } from '@/lib/auth/devImpersonation';
import { fetchContactDisplayNames } from '@/lib/contacts/fetchContactDisplayNames';
import { getDecisionMakerReviewerId } from '@/lib/reviews/workflow';
import { formatVersionLabel } from '@/lib/artifacts/versioning';
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
  | { name: string | null; status?: string | null }
  | Array<{ name: string | null; status?: string | null }>
  | null;

function pickProjectField(rel: ProjectRelation): { name: string; status: string | null } {
  if (!rel) return { name: 'Project', status: null };
  const row = Array.isArray(rel) ? rel[0] : rel;
  return {
    name: row?.name ?? 'Project',
    status: row?.status ?? null,
  };
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
    const createdByContributorIdRaw = String(
      o.createdByContributorId ?? '',
    ).trim();
    out.push({
      id: String(o.id ?? `tradeoff-loaded-${i}`),
      label,
      severity,
      relatedArtifactIds: rel.length > 0 ? rel : undefined,
      artifactLabel: artifactLabelRaw || undefined,
      createdByContributorId: createdByContributorIdRaw || undefined,
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

/** When `artifact_versions` rows exist for this review, overlay canonical name + version label. */
function applyArtifactVersionDisplay(
  base: ReviewArtifact[],
  fromDb: {
    version_number: string;
    version_label: string | null;
    artifact_name: string;
    artifact_id: string | null;
  }[],
): ReviewArtifact[] {
  return base.map((a, i) => {
    const row = fromDb[i];
    if (!row) return a;
    const displayName =
      row.version_label?.trim() || row.artifact_name.trim() || a.label;
    if (!displayName.trim()) return a;
    return {
      ...a,
      title: displayName,
      label: displayName,
      iteration: formatVersionLabel(String(row.version_number ?? 'v1')),
      canonicalArtifactId: row.artifact_id,
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
      mimeType: mimeType || null,
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
      updated_at,
      creator_id,
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
      last_reminder_sent_at,
      projects ( name, status )
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
    updated_at: string | null;
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
    last_reminder_sent_at: string | null;
    projects: ProjectRelation;
  };

  const tradeoffs = parseReviewTradeoffsFromRow(row.tradeoffs);

  let artifacts = mapArtifacts(extractArtifactArray(row.artifacts));

  const { data: versionRows } = await supabase
    .from('artifact_versions')
    .select('artifact_id, version_number, label, created_at, artifacts ( name )')
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
      const versionLabel =
        o.label == null ? '' : String(o.label).trim();
      const artifactName = String(name ?? '').trim();
      return {
        artifact_id:
          o.artifact_id == null || String(o.artifact_id).trim() === ''
            ? null
            : String(o.artifact_id),
        version_number: formatVersionLabel(String(o.version_number ?? 'v1')),
        version_label: versionLabel || null,
        artifact_name: artifactName,
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
  let allFeedbackRows: ReviewerFeedbackEntry[] = [];
  let changeRequests: ReviewChangeRequestEntry[] = [];
  let cardReplies: CardReplyRow[] = [];
  let currentContributorId: string | null = null;
  let currentContributorRole: string | null = null;
  let currentContributorPermissionLevel: string | null = null;
  let workspacePermissionLevel: string | null = null;
  let currentAuthUserId: string | null = null;
  let reviewOwnerName: string | null = row.owner_display_name ?? null;
  const reviewCreatorAuthUserId =
    (row as { creator_id?: string | null }).creator_id == null
      ? null
      : String((row as { creator_id?: string | null }).creator_id);

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  // Session auth user id — used for creator permission checks (reviews.creator_id).
  currentAuthUserId = authUser?.id ?? null;
  let workspaceAuthUserId = currentAuthUserId;

  if (row.project_id) {
    const [{ data: projectProblemsData }, { data: reviewProblemsData }] =
      await Promise.all([
        supabase
          .from('problems')
          .select('id, description')
          .eq('project_id', row.project_id)
          .is('review_id', null)
          .order('created_at', { ascending: true }),
        supabase
          .from('problems')
          .select('id, description')
          .eq('review_id', params.reviewId)
          .order('created_at', { ascending: true }),
      ]);

    const projectProblems = (projectProblemsData ?? []).map((p) => {
      const o = p as { id: unknown; description?: unknown };
      const id = String(o.id ?? '');
      return {
        id,
        text: String(o.description ?? ''),
        selected: relatedProblemIds.includes(id),
      };
    });

    const reviewProblems = (reviewProblemsData ?? []).map((p) => {
      const o = p as { id: unknown; description?: unknown };
      return {
        id: String(o.id ?? ''),
        text: String(o.description ?? ''),
        selected: true,
      };
    });

    problems = [...projectProblems, ...reviewProblems];

    const { data: contributorsData } = await supabase
      .from('contributors')
      .select('id, name, role, email')
      .eq('project_id', row.project_id)
      .order('created_at', { ascending: true });

    contributors = (contributorsData ?? []).map((c) => ({
      id: String((c as Record<string, unknown>).id ?? ''),
      name: String((c as Record<string, unknown>).name ?? ''),
      role: String((c as Record<string, unknown>).role ?? ''),
      email: String((c as Record<string, unknown>).email ?? '').trim() || null,
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

    if (currentContributorId) {
      const { data: contributorAuthRow } = await supabase
        .from('contributors')
        .select('user_id')
        .eq('id', currentContributorId)
        .maybeSingle();
      const contributorAuthUserId = String(
        (contributorAuthRow as { user_id?: string | null } | null)?.user_id ?? '',
      ).trim();
      const devImpersonatedContributorId = await getDevImpersonatedContributorId();
      if (contributorAuthUserId) {
        workspaceAuthUserId = contributorAuthUserId;
      } else if (devImpersonatedContributorId === currentContributorId) {
        workspaceAuthUserId = null;
      }
    }

    const { data: projectWorkspaceRow } = await supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', row.project_id)
      .maybeSingle();
    const projectWorkspaceId = String(
      (projectWorkspaceRow as { workspace_id?: string | null } | null)?.workspace_id ?? '',
    ).trim();

    if (projectWorkspaceId && workspaceAuthUserId) {
      const { data: member } = await supabase
        .from('workspace_members')
        .select('permission_level, role')
        .eq('workspace_id', projectWorkspaceId)
        .eq('user_id', workspaceAuthUserId)
        .maybeSingle();
      const memberRow = member as {
        permission_level?: string | null;
        role?: string | null;
      } | null;
      const fromLevel = memberRow?.permission_level?.trim();
      if (fromLevel) {
        workspacePermissionLevel = fromLevel;
      } else if (String(memberRow?.role ?? '').trim().toLowerCase() === 'admin') {
        workspacePermissionLevel = 'admin';
      }
    }

    if (reviewCreatorAuthUserId && projectWorkspaceId) {
      const { data: creatorContributor } = await supabase
        .from('contributors')
        .select('name')
        .eq('workspace_id', projectWorkspaceId)
        .eq('user_id', reviewCreatorAuthUserId)
        .is('project_id', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const creatorName = String(
        (creatorContributor as { name?: string | null } | null)?.name ?? '',
      ).trim();
      if (creatorName) {
        reviewOwnerName = creatorName;
      }
    }

    const reviewerIds = reviewerIdsEarly;

    let reviewerContributors: Array<{
      id: string;
      name: string;
      role: string;
      email: string;
      userId: string | null;
    }> = [];

    if (reviewerIds.length > 0) {
      const { data: reviewerData } = await supabase
        .from('contributors')
        .select('id, name, role, email, user_id')
        .in('id', reviewerIds);
      reviewerContributors = (reviewerData ?? []).map((c) => {
        const item = c as Record<string, unknown>;
        return {
          id: String(item.id ?? ''),
          name: String(item.name ?? ''),
          role: String(item.role ?? ''),
          email: String(item.email ?? ''),
          userId:
            item.user_id == null ? null : String(item.user_id),
        };
      });
    }

    const reviewerContributorById = new Map(
      reviewerContributors.map((c) => [c.id, c] as const)
    );

    const rt = String(row.review_type ?? '').trim().toLowerCase();
    const hasDecisionMakerFlow = rt === 'compare';
    assignedReviewers = reviewerIds
      .map((reviewerId, index): ReviewerAssignment | null => {
        const contributor = reviewerContributorById.get(reviewerId);
        if (!contributor) return null;
        const jobRole = String(contributor.role ?? '').trim();
        return {
          id: contributor.id,
          name: contributor.name,
          role: jobRole,
          email: contributor.email,
          isDecisionMaker: hasDecisionMakerFlow && index === 0,
          userId: contributor.userId,
        };
      })
      .filter((item): item is ReviewerAssignment => item != null);

    const serviceSupabase = createServiceClient();
    const { data: feedbackRows, error: feedbackError } = await serviceSupabase
      .from('reviewer_feedback')
      .select(
        'id, reviewer_id, feedback_status, feedback_text, selected_option, feedback_submitted_at, reply_text, reply_by_id, reply_at, created_at, feedback_kind, submitted_by_id'
      )
      .eq('review_id', row.id)
      .order('created_at', { ascending: true });
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

    const submittedByIds = [...new Set(
      (feedbackRows ?? [])
        .map((item) =>
          String((item as Record<string, unknown>).submitted_by_id ?? '').trim(),
        )
        .filter(Boolean),
    )];
    const knownContributorNames = new Map(
      [...contributors, ...reviewerContributors].map((contributor) => [
        contributor.id,
        contributor.name,
      ] as const),
    );
    const missingSubmittedByIds = submittedByIds.filter(
      (contributorId) => !knownContributorNames.has(contributorId),
    );
    if (missingSubmittedByIds.length > 0) {
      const { data: submittedByRows } = await serviceSupabase
        .from('contributors')
        .select('id, name')
        .in('id', missingSubmittedByIds);
      for (const row of submittedByRows ?? []) {
        const contributor = row as Record<string, unknown>;
        const id = String(contributor.id ?? '').trim();
        const name = String(contributor.name ?? '').trim();
        if (id && name) {
          knownContributorNames.set(id, name);
        }
      }
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

    function mapFeedbackRow(
      reviewerId: string,
      reviewerName: string,
      reviewerRole: string,
      feedback: Record<string, unknown>,
    ): ReviewerFeedbackEntry {
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
        feedbackKind: (() => {
          const raw = feedback.feedback_kind == null ? null : String(feedback.feedback_kind);
          if (
            raw === 'approval' ||
            raw === 'change-request' ||
            raw === 'mixed' ||
            raw === 'generic'
          ) {
            return raw;
          }
          return null;
        })(),
        submittedAt:
          feedback.feedback_submitted_at == null
            ? null
            : String(feedback.feedback_submitted_at),
        replyText: feedback.reply_text == null ? null : String(feedback.reply_text),
        replyById: feedback.reply_by_id == null ? null : String(feedback.reply_by_id),
        replyAt: feedback.reply_at == null ? null : String(feedback.reply_at),
        requestedAt: feedback.created_at == null ? null : String(feedback.created_at),
        submittedById:
          feedback.submitted_by_id == null ? null : String(feedback.submitted_by_id),
        submittedByName:
          feedback.submitted_by_id == null
            ? null
            : knownContributorNames.get(String(feedback.submitted_by_id)) ?? null,
      };
    }

    function pickLatestFeedbackRow(rows: Record<string, unknown>[]) {
      if (rows.length === 0) return null;
      return [...rows].sort((a, b) => {
        const aTs = new Date(
          String(a.feedback_submitted_at ?? a.created_at ?? 0),
        ).getTime();
        const bTs = new Date(
          String(b.feedback_submitted_at ?? b.created_at ?? 0),
        ).getTime();
        return bTs - aTs;
      })[0];
    }

    allFeedbackRows = reviewerIdsForFeedback.flatMap((reviewerId) => {
      const assigned = assignedById.get(reviewerId);
      const contributor = contributorById.get(reviewerId);
      const reviewerName = assigned?.name ?? contributor?.name ?? 'Reviewer';
      const reviewerRole = assigned?.role ?? contributor?.role ?? '';
      const rows = rowsByReviewer.get(reviewerId) ?? [];
      return rows.map((feedback) =>
        mapFeedbackRow(reviewerId, reviewerName, reviewerRole, feedback),
      );
    });

    feedbackEntries = reviewerIdsForFeedback.map((reviewerId) => {
      const assigned = assignedById.get(reviewerId);
      const contributor = contributorById.get(reviewerId);
      const reviewerName = assigned?.name ?? contributor?.name ?? 'Reviewer';
      const reviewerRole = assigned?.role ?? contributor?.role ?? '';
      const rows = rowsByReviewer.get(reviewerId) ?? [];
      const latest = pickLatestFeedbackRow(rows);
      if (!latest) {
        return {
          feedbackId: null,
          reviewerId,
          reviewerName,
          reviewerRole,
          status: 'pending' as const,
          feedbackText: null,
          selectedOption: null,
          feedbackKind: null,
          submittedAt: null,
          replyText: null,
          replyById: null,
          replyAt: null,
          requestedAt: null,
          submittedById: null,
          submittedByName: null,
        } satisfies ReviewerFeedbackEntry;
      }
      return mapFeedbackRow(reviewerId, reviewerName, reviewerRole, latest);
    });

    const { data: changeRequestsData } = await supabase
      .from('change_requests')
      .select(
        'id, reviewer_id, artifact_ids, changes_needed, reply_text, reply_by_id, reply_at, created_at, batch_id, batch_number, reviewer_feedback_id, change_number, completed_at, completed_by_id, reviewer:contributors!reviewer_id(id, name)'
      )
      .eq('review_id', row.id)
      .order('created_at', { ascending: false });
    changeRequests = (changeRequestsData ?? []).map((item) => {
      const data = item as Record<string, unknown>;
      const reviewerJoin = data.reviewer as Record<string, unknown> | null | undefined;
      const reviewerNameFromJoin =
        reviewerJoin && reviewerJoin.name != null
          ? String(reviewerJoin.name).trim()
          : '';
      return {
        id: String(data.id ?? ''),
        reviewer_id: data.reviewer_id == null ? null : String(data.reviewer_id),
        reviewer_name: reviewerNameFromJoin || null,
        artifact_ids: Array.isArray(data.artifact_ids)
          ? data.artifact_ids.map((value) => String(value))
          : [],
        changes_needed: data.changes_needed == null ? null : String(data.changes_needed),
        reply_text: data.reply_text == null ? null : String(data.reply_text),
        reply_by_id: data.reply_by_id == null ? null : String(data.reply_by_id),
        reply_at: data.reply_at == null ? null : String(data.reply_at),
        created_at: String(data.created_at ?? ''),
        batch_id: data.batch_id == null ? null : String(data.batch_id),
        batch_number:
          data.batch_number == null ? null : Number(data.batch_number),
        reviewer_feedback_id:
          data.reviewer_feedback_id == null ? null : String(data.reviewer_feedback_id),
        change_number:
          data.change_number == null ? null : Number(data.change_number),
        completed_at: data.completed_at == null ? null : String(data.completed_at),
        completed_by_id:
          data.completed_by_id == null ? null : String(data.completed_by_id),
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

      // Resolve replier display names server-side so attribution does not depend
      // on the replier being present in the client `contributors` list.
      const replyAuthorIds = [
        ...new Set(
          (cardRepliesData ?? [])
            .map((item) => {
              const value = (item as Record<string, unknown>).reply_by_id;
              return value == null ? '' : String(value);
            })
            .filter(Boolean),
        ),
      ];
      const replyAuthorNameById = new Map<string, string>();
      if (replyAuthorIds.length > 0) {
        const { data: replyAuthors } = await supabase
          .from('contributors')
          .select('id, name')
          .in('id', replyAuthorIds);
        for (const author of (replyAuthors ?? []) as Array<{
          id?: string | null;
          name?: string | null;
        }>) {
          const id = String(author.id ?? '').trim();
          const name = String(author.name ?? '').trim();
          if (id && name) replyAuthorNameById.set(id, name);
        }
      }

      cardReplies = (cardRepliesData ?? []).map((item) => {
        const data = item as Record<string, unknown>;
        const ct = String(data.card_type ?? '');
        const cardType: CardReplyRow['card_type'] =
          ct === 'change_request' ? 'change_request' : 'feedback';
        const replyById = data.reply_by_id == null ? null : String(data.reply_by_id);
        return {
          id: String(data.id ?? ''),
          card_type: cardType,
          card_id: String(data.card_id ?? ''),
          reply_text: String(data.reply_text ?? ''),
          reply_by_id: replyById,
          reply_by_name: replyById ? replyAuthorNameById.get(replyById) ?? null : null,
          created_at: String(data.created_at ?? ''),
        } satisfies CardReplyRow;
      });
    }
  }

  let decisionSnapshots: Array<{
    id: string;
    decision_status: string;
    decision_comments: string | null;
    decision_selected_artifact_ids: string[];
    decision_owner_id: string | null;
    decision_made_at: string;
    superseded_at: string | null;
    entry_role: 'approval' | 'change_request';
  }> = [];
  const { data: snapshotRows } = await supabase
    .from('review_decision_snapshots')
    .select(
      'id, decision_status, decision_comments, decision_selected_artifact_ids, decision_owner_id, decision_made_at, superseded_at, entry_role',
    )
    .eq('review_id', row.id)
    .order('decision_made_at', { ascending: false });
  if (snapshotRows) {
    decisionSnapshots = snapshotRows.map((item) => {
      const data = item as Record<string, unknown>;
      return {
        id: String(data.id ?? ''),
        decision_status: String(data.decision_status ?? ''),
        decision_comments:
          data.decision_comments == null ? null : String(data.decision_comments),
        decision_selected_artifact_ids: Array.isArray(data.decision_selected_artifact_ids)
          ? (data.decision_selected_artifact_ids as unknown[]).map((id) => String(id))
          : [],
        decision_owner_id:
          data.decision_owner_id == null ? null : String(data.decision_owner_id),
        decision_made_at: String(data.decision_made_at ?? ''),
        superseded_at: data.superseded_at == null ? null : String(data.superseded_at),
        entry_role:
          String(data.entry_role ?? 'approval').trim() === 'change_request'
            ? 'change_request'
            : 'approval',
      };
    });
  }

  return (
    <ReviewDetailView
      reviewId={row.id}
      title={row.title ?? 'Untitled Review'}
      status={row.status ?? 'draft'}
      reviewType={row.review_type ?? ''}
      reviewFocus={row.review_focus ?? ''}
      projectId={row.project_id ?? ''}
      projectName={pickProjectField(row.projects).name}
      projectStatus={pickProjectField(row.projects).status}
      mode={mode}
      artifacts={artifacts}
      problems={problems}
      contributors={contributors}
      assignedReviewers={assignedReviewers}
      feedbackEntries={feedbackEntries}
      allFeedbackRows={allFeedbackRows}
      changeRequests={changeRequests}
      cardReplies={cardReplies}
      currentContributorId={currentContributorId}
      currentContributorRole={currentContributorRole}
      currentContributorPermissionLevel={currentContributorPermissionLevel}
      workspacePermissionLevel={workspacePermissionLevel}
      currentAuthUserId={currentAuthUserId}
      reviewCreatorAuthUserId={reviewCreatorAuthUserId}
      requireDecisionMaker={row.require_decision_maker ?? false}
      decisionMakerId={row.decision_owner_id}
      contactDisplayById={contactDisplayById}
      reviewOwnerName={reviewOwnerName}
      lastReminderSentAt={row.last_reminder_sent_at ?? null}
      reviewCreatedAt={row.created_at}
      reviewUpdatedAt={row.updated_at}
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
      decisionSnapshots={decisionSnapshots}
    />
  );
}
