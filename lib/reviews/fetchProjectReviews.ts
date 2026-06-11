import { formatDistanceToNow } from "@/lib/formatDistanceToNow";
import {
  resolveCanonicalContributorIds,
  type ResolvedContributor,
} from "@/lib/contributors/resolveCanonicalContributorIds";
import type {
  ReviewArtifactStored,
  ReviewCardData,
  ReviewDbStatus,
  ReviewRow,
  ReviewType
} from "@/types/review";
import type { SupabaseClient } from "@supabase/supabase-js";

type ReviewCardCounts = {
  feedbackCount: number;
  changeRequestCount: number;
};

function parseReviewType(raw: string | null | undefined): ReviewType {
  const s = String(raw ?? "").toLowerCase();
  if (s === "critique" || s === "align" || s === "approve") return s;
  return "compare";
}

function parseStatus(raw: string | null | undefined): ReviewDbStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  const allowed: ReviewDbStatus[] = [
    "draft",
    "in-review",
    "feedback-submitted",
    "paused",
    "complete",
    "approved",
    "needs-changes",
    "changes-needed",
    "blocked",
  ];
  if (allowed.includes(s as ReviewDbStatus)) return s as ReviewDbStatus;
  return "in-review";
}

function parseArtifacts(raw: unknown): ReviewArtifactStored[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewArtifactStored[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kind = o.kind === "link" ? "link" : "file";
    out.push({
      kind,
      title: String(o.title ?? ""),
      iterationLabel: String(o.iterationLabel ?? ""),
      description: String(o.description ?? ""),
      url: o.url == null || String(o.url).trim() === "" ? null : String(o.url),
      originalFileName:
        o.originalFileName == null ? null : String(o.originalFileName),
      mimeType: o.mimeType == null ? null : String(o.mimeType),
      sizeBytes:
        typeof o.sizeBytes === "number"
          ? o.sizeBytes
          : o.sizeBytes != null
            ? Number(o.sizeBytes)
            : null
    });
  }
  return out;
}

function parseUuidArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x ?? ""));
}

function parseArtifactType(raw: unknown): "figma" | "pdf" | null {
  const s = String(raw ?? "").toLowerCase();
  if (s === "pdf") return "pdf";
  if (s === "figma") return "figma";
  return null;
}

/** True when the review row has narrative decision body text (canonical `decision_comments`, legacy `decision_text`). */
export function reviewRowHasRecordedDecision(r: Record<string, unknown>): boolean {
  const dc = String(r.decision_comments ?? "").trim();
  const dt = String(r.decision_text ?? "").trim();
  return !!(dc || dt);
}

function getOrCreateReviewCardCounts(
  countsByReviewId: Map<string, ReviewCardCounts>,
  reviewId: string,
): ReviewCardCounts {
  const existing = countsByReviewId.get(reviewId);
  if (existing) return existing;
  const next = { feedbackCount: 0, changeRequestCount: 0 };
  countsByReviewId.set(reviewId, next);
  return next;
}

export type ResolvedReviewCardReviewer = ResolvedContributor;

/** Build ReviewCard reviewer props using canonical contributors.id values. */
export function buildReviewCardReviewers(
  rawContributorIds: unknown,
  resolutionByRawId: Map<string, ResolvedReviewCardReviewer>,
): Array<{ id: string; name: string }> {
  if (!Array.isArray(rawContributorIds)) return [];
  return rawContributorIds
    .map((rawId) => {
      const raw = String(rawId ?? "").trim();
      const match = resolutionByRawId.get(raw);
      if (!raw || !match) return null;
      return { id: match.contributorId, name: match.name };
    })
    .filter((item): item is { id: string; name: string } => item != null);
}

export async function fetchReviewCardMeta(
  supabase: SupabaseClient,
  {
    reviewIds,
    reviewerIds,
  }: {
    reviewIds: string[];
    reviewerIds: string[];
  },
): Promise<{
  reviewerNameById: Map<string, string>;
  reviewerResolutionByRawId: Map<string, ResolvedReviewCardReviewer>;
  countsByReviewId: Map<string, ReviewCardCounts>;
}> {
  const reviewerNameById = new Map<string, string>();
  const countsByReviewId = new Map<string, ReviewCardCounts>();
  const reviewerResolutionByRawId = await resolveCanonicalContributorIds(
    supabase,
    reviewerIds,
  );
  for (const [rawId, match] of reviewerResolutionByRawId) {
    reviewerNameById.set(rawId, match.name);
  }

  const [feedbackResponse, changeRequestResponse] = await Promise.all([
    reviewIds.length > 0
      ? supabase
          .from("reviewer_feedback")
          .select("id, review_id, feedback_kind")
          .eq("feedback_status", "submitted")
          .in("review_id", reviewIds)
      : Promise.resolve({ data: [], error: null }),
    reviewIds.length > 0
      ? supabase
          .from("change_requests")
          .select("review_id, reviewer_feedback_id, completed_at")
          .in("review_id", reviewIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const feedbackIdsWithChangeRequests = new Set<string>();

  for (const row of changeRequestResponse.data ?? []) {
    const changeRequest = row as Record<string, unknown>;
    const reviewId = String(changeRequest.review_id ?? "").trim();
    if (!reviewId) continue;
    const reviewerFeedbackId = String(changeRequest.reviewer_feedback_id ?? "").trim();
    if (reviewerFeedbackId) {
      feedbackIdsWithChangeRequests.add(reviewerFeedbackId);
    }
    const completedAt = changeRequest.completed_at;
    if (completedAt != null && String(completedAt).trim() !== "") continue;
    const counts = getOrCreateReviewCardCounts(countsByReviewId, reviewId);
    counts.changeRequestCount += 1;
  }

  for (const row of feedbackResponse.data ?? []) {
    const feedback = row as Record<string, unknown>;
    const reviewId = String(feedback.review_id ?? "").trim();
    if (!reviewId) continue;
    const feedbackId = String(feedback.id ?? "").trim();
    const rawKind = String(feedback.feedback_kind ?? "").trim().toLowerCase();
    const hasChangeRequests = feedbackId ? feedbackIdsWithChangeRequests.has(feedbackId) : false;
    const isPureFeedback =
      rawKind === "approval" ||
      rawKind === "generic" ||
      (!rawKind && !hasChangeRequests);
    if (!isPureFeedback) continue;
    const counts = getOrCreateReviewCardCounts(countsByReviewId, reviewId);
    counts.feedbackCount += 1;
  }

  return { reviewerNameById, reviewerResolutionByRawId, countsByReviewId };
}

export async function fetchProjectReviewsForCards(
  supabase: SupabaseClient,
  projectId: string
): Promise<ReviewCardData[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, title, status, created_at, owner_display_name, review_focus, reviewer_contributor_ids, artifacts, review_type, decision_status, decision_comments, decision_selected_artifact_ids, decision_text, require_decision_maker, artifact_file_name, artifact_file_type, artifact_name, artifact_iteration, artifact_description, artifact_file_url"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const reviewIds = data
    .map((row) => String((row as Record<string, unknown>).id ?? ""))
    .filter(Boolean);
  const reviewerIds = [...new Set(
    data.flatMap((row) =>
      Array.isArray((row as Record<string, unknown>).reviewer_contributor_ids)
        ? ((row as Record<string, unknown>).reviewer_contributor_ids as unknown[])
            .map((id) => String(id).trim())
            .filter(Boolean)
        : [],
    ),
  )];
  const { reviewerResolutionByRawId, countsByReviewId } = await fetchReviewCardMeta(supabase, {
    reviewIds,
    reviewerIds,
  });
  return data.map((row) => {
    const r = row as Record<string, unknown>;
    const artifacts = parseArtifacts(r.artifacts);
    const iterationLabel =
      artifacts.map((a) => a.iterationLabel.trim()).find(Boolean) ?? undefined;
    const seenIterationTags = new Set<string>();
    const tags: Array<{ label: string; variant: "default" }> = [];
    for (const a of artifacts) {
      const label = a.iterationLabel.trim();
      if (!label || seenIterationTags.has(label)) continue;
      seenIterationTags.add(label);
      tags.push({ label, variant: "default" });
    }
    const created = r.created_at ? new Date(String(r.created_at)) : new Date();
    const dateLabel = `Updated ${formatDistanceToNow(created, { addSuffix: true })}`;
    const focusRaw = r.review_focus;
    const reviewFocus =
      focusRaw == null || String(focusRaw).trim() === ""
        ? null
        : String(focusRaw).trim();
    const reviewers = buildReviewCardReviewers(
      r.reviewer_contributor_ids,
      reviewerResolutionByRawId,
    );
    return {
      id: String(r.id ?? ""),
      title: String(r.title ?? ""),
      status: parseStatus(r.status as string | undefined),
      reviewType: parseReviewType(r.review_type as string | undefined),
      decisionStatus:
        r.decision_status == null || String(r.decision_status).trim() === ""
          ? null
          : String(r.decision_status),
      requireDecisionMaker: Boolean(r.require_decision_maker),
      ownerName: String(r.owner_display_name ?? "Reviewer"),
      dateLabel,
      dateTooltipIso:
        r.created_at == null ? null : String(r.created_at),
      description: reviewFocus,
      review_focus: reviewFocus,
      review_focus_summary: null,
      review_focus_summary_source: null,
      iterationLabel,
      feedbackCount: countsByReviewId.get(String(r.id ?? ""))?.feedbackCount ?? 0,
      changeRequestCount: countsByReviewId.get(String(r.id ?? ""))?.changeRequestCount ?? 0,
      reviewers,
      artifact_file_name:
        r.artifact_file_name == null ? null : String(r.artifact_file_name),
      artifact_file_type: parseArtifactType(r.artifact_file_type),
      artifact_name: r.artifact_name == null ? null : String(r.artifact_name),
      artifact_iteration:
        r.artifact_iteration == null ? null : String(r.artifact_iteration),
      artifact_description:
        r.artifact_description == null ? null : String(r.artifact_description),
      artifact_file_url:
        r.artifact_file_url == null ? null : String(r.artifact_file_url),
      ...(tags.length > 0 ? { tags } : {})
    } satisfies ReviewCardData;
  });
}

export function mapDbRowToReviewRow(row: Record<string, unknown>): ReviewRow {
  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    title: String(row.title ?? ""),
    review_type: parseReviewType(row.review_type as string | undefined),
    send_notification: Boolean(row.send_notification),
    review_focus:
      row.review_focus == null || String(row.review_focus).trim() === ""
        ? null
        : String(row.review_focus),
    related_problem_ids: parseUuidArray(row.related_problem_ids),
    reviewer_contributor_ids: parseUuidArray(row.reviewer_contributor_ids),
    require_decision_maker: Boolean(row.require_decision_maker),
    owner_display_name: String(row.owner_display_name ?? ""),
    artifacts: parseArtifacts(row.artifacts),
    artifact_file_name:
      row.artifact_file_name == null ? null : String(row.artifact_file_name),
    artifact_file_type: parseArtifactType(row.artifact_file_type),
    artifact_name: row.artifact_name == null ? null : String(row.artifact_name),
    artifact_iteration:
      row.artifact_iteration == null ? null : String(row.artifact_iteration),
    artifact_description:
      row.artifact_description == null
        ? null
        : String(row.artifact_description),
    artifact_file_url:
      row.artifact_file_url == null ? null : String(row.artifact_file_url),
    status: parseStatus(row.status as string | undefined),
    created_at: String(row.created_at ?? "")
  };
}
