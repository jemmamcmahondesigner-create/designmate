import type {
  ReviewArtifactStored,
  ReviewDbStatus,
  ReviewRow,
  ReviewType
} from "@/types/review";
import type { ReviewCardData } from "@/components/project-detail/ReviewCard";
import type { SupabaseClient } from "@supabase/supabase-js";

function parseReviewType(raw: string | null | undefined): ReviewType {
  const s = String(raw ?? "").toLowerCase();
  if (s === "critique" || s === "align" || s === "approve") return s;
  return "compare";
}

function parseStatus(raw: string | null | undefined): ReviewDbStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "approved" || s === "needs-changes" || s === "blocked") return s;
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

export async function fetchProjectReviewsForCards(
  supabase: SupabaseClient,
  projectId: string
): Promise<ReviewCardData[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, title, status, created_at, owner_display_name, artifacts, review_type"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const r = row as Record<string, unknown>;
    const artifacts = parseArtifacts(r.artifacts);
    const iterationLabel =
      artifacts.map((a) => a.iterationLabel.trim()).find(Boolean) ?? undefined;
    const created = r.created_at ? new Date(String(r.created_at)) : new Date();
    const dateLabel = created.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
    return {
      id: String(r.id ?? ""),
      title: String(r.title ?? ""),
      status: parseStatus(r.status as string | undefined),
      ownerName: String(r.owner_display_name ?? "Reviewer"),
      dateLabel,
      iterationLabel
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
    status: parseStatus(row.status as string | undefined),
    created_at: String(row.created_at ?? "")
  };
}
