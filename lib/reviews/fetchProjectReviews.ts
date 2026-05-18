import { formatDistanceToNow } from "@/lib/formatDistanceToNow";
import type {
  ReviewArtifactStored,
  ReviewCardData,
  ReviewDbStatus,
  ReviewRow,
  ReviewType
} from "@/types/review";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export async function fetchProjectReviewsForCards(
  supabase: SupabaseClient,
  projectId: string
): Promise<ReviewCardData[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, title, status, created_at, owner_display_name, review_focus, artifacts, review_type, decision_status, decision_comments, decision_selected_artifact_ids, decision_text, require_decision_maker, artifact_file_name, artifact_file_type, artifact_name, artifact_iteration, artifact_description, artifact_file_url"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const reviewIds = data
    .map((row) => String((row as Record<string, unknown>).id ?? ""))
    .filter(Boolean);
  const commentCountsByReviewId = new Map<string, number>();
  if (reviewIds.length > 0) {
    const { data: feedbackRows } = await supabase
      .from("reviewer_feedback")
      .select("review_id")
      .eq("feedback_status", "submitted")
      .in("review_id", reviewIds);
    for (const feedbackRow of feedbackRows ?? []) {
      const reviewId = String((feedbackRow as Record<string, unknown>).review_id ?? "");
      if (!reviewId) continue;
      commentCountsByReviewId.set(reviewId, (commentCountsByReviewId.get(reviewId) ?? 0) + 1);
    }
  }

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
    return {
      id: String(r.id ?? ""),
      title: String(r.title ?? ""),
      status: parseStatus(r.status as string | undefined),
      decisionStatus:
        r.decision_status == null || String(r.decision_status).trim() === ""
          ? null
          : String(r.decision_status),
      requireDecisionMaker: Boolean(r.require_decision_maker),
      ownerName: String(r.owner_display_name ?? "Reviewer"),
      dateLabel,
      description: reviewFocus,
      review_focus: reviewFocus,
      iterationLabel,
      commentCount: commentCountsByReviewId.get(String(r.id ?? "")) ?? 0,
      decisionCount: reviewRowHasRecordedDecision(r) ? 1 : 0,
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
