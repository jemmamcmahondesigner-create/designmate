import "server-only";

import { compareVersions, formatVersionLabel } from "@/lib/artifacts/versioning";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProjectArtifactOverviewRow = {
  artifactId: string;
  artifactName: string;
  versionId: string;
  versionNumber: string;
  reviewId: string | null;
  reviewTitle: string | null;
  reviewStatus: string | null;
  reviewType: string | null;
  reviewTypeKey: "compare" | "approve" | "align" | "critique" | null;
  feedbackCount: number;
};

export type ProjectArtifactHistoryVersion = {
  versionId: string;
  artifactId: string;
  versionNumber: string;
  /** ISO timestamp from `artifact_versions.created_at` for “Edited … ago”. */
  versionCreatedAt: string | null;
  reviewId: string | null;
  reviewTitle: string | null;
  reviewStatus: string | null;
  reviewType: string | null;
  fileUrl: string | null;
  linkUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  description: string | null;
  decisionSummary: string | null;
  feedbackCount: number;
  reviewerPeople: { id: string; name: string; avatarUrl: string | null }[];
  /** From parent `artifacts.snapshot_url`. */
  snapshot_url?: string | null;
  /** From parent `artifacts.snapshot_captured_at`. */
  snapshot_captured_at?: string | null;
};

export type ProjectArtifactsTabPayload = {
  overview: ProjectArtifactOverviewRow[];
  historyByArtifactId: Record<string, ProjectArtifactHistoryVersion[]>;
};

type ReviewJoin = {
  id?: string;
  title?: string | null;
  status?: string | null;
  review_type?: string | null;
  decision_text?: string | null;
  decision_comments?: string | null;
  decision_status?: string | null;
  reviewer_contributor_ids?: unknown;
} | null;

function normContributorIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const s = String(x ?? "").trim();
    if (s) out.push(s);
  }
  return out;
}

function mergeReviewerIds(assigned: string[], fromFeedback: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of assigned) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of fromFeedback) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normReviewType(rt: string | null | undefined): string {
  const s = String(rt ?? "").trim().toLowerCase();
  if (s === "comparison") return "Compare";
  if (s === "approval") return "Approve";
  if (s === "alignment") return "Align";
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normReviewTypeKey(
  rt: string | null | undefined
): "compare" | "approve" | "align" | "critique" | null {
  const s = String(rt ?? "").trim().toLowerCase();
  if (s === "compare" || s === "comparison") return "compare";
  if (s === "approve" || s === "approval") return "approve";
  if (s === "align" || s === "alignment") return "align";
  if (s === "critique") return "critique";
  return null;
}

function decisionSummaryFromReview(r: ReviewJoin): string | null {
  if (!r) return null;
  const t =
    (r.decision_comments != null && String(r.decision_comments).trim() !== ""
      ? String(r.decision_comments)
      : null) ??
    (r.decision_text != null && String(r.decision_text).trim() !== ""
      ? String(r.decision_text)
      : null);
  return t?.trim() ? t : null;
}

export async function loadProjectArtifactsTab(
  projectId: string
): Promise<ProjectArtifactsTabPayload> {
  const supabase = await createSupabaseServerClient();
  const pid = projectId.trim();
  if (!pid) return { overview: [], historyByArtifactId: {} };

  const { data: artifactRows } = await supabase
    .from("artifacts")
    .select("id, name, snapshot_url, snapshot_captured_at")
    .eq("project_id", pid)
    .order("name", { ascending: true });

  const artifactsList = (artifactRows ?? []).map((row) => {
    const o = row as Record<string, unknown>;
    return {
      id: String(o.id ?? ""),
      name: String(o.name ?? ""),
      snapshot_url:
        o.snapshot_url == null || String(o.snapshot_url).trim() === ""
          ? null
          : String(o.snapshot_url),
      snapshot_captured_at:
        o.snapshot_captured_at == null ||
        String(o.snapshot_captured_at).trim() === ""
          ? null
          : String(o.snapshot_captured_at),
    };
  });

  if (artifactsList.length === 0) {
    return { overview: [], historyByArtifactId: {} };
  }

  const artifactIds = artifactsList.map((a) => a.id);
  const snapshotByArtifactId = new Map(
    artifactsList.map(
      (a) =>
        [
          a.id,
          {
            snapshot_url: a.snapshot_url,
            snapshot_captured_at: a.snapshot_captured_at,
          },
        ] as const,
    ),
  );

  const { data: versionRows } = await supabase
    .from("artifact_versions")
    .select(
      `
      id,
      artifact_id,
      version_number,
      review_id,
      created_at,
      file_url,
      link_url,
      file_name,
      file_type,
      description,
      reviews (
        id,
        title,
        status,
        review_type,
        decision_text,
        decision_comments,
        decision_status,
        reviewer_contributor_ids
      )
    `
    )
    .in("artifact_id", artifactIds);

  type VRow = {
    id: string;
    artifact_id: string;
    version_number: string;
    review_id: string | null;
    created_at: string | null;
    file_url: string | null;
    link_url: string | null;
    file_name: string | null;
    file_type: string | null;
    description: string | null;
    /** Nested `reviews` row from Supabase — normalized to a single object in `parsed`. */
    reviews: ReviewJoin;
  };

  const parsed: VRow[] = (versionRows ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    const rev = r.reviews;
    const reviewSingle = Array.isArray(rev) ? rev[0] ?? null : rev ?? null;
    return {
      id: String(r.id ?? ""),
      artifact_id: String(r.artifact_id ?? ""),
      version_number: formatVersionLabel(String(r.version_number ?? "v1")),
      review_id: r.review_id == null ? null : String(r.review_id),
      created_at:
        r.created_at == null || String(r.created_at).trim() === ""
          ? null
          : String(r.created_at),
      file_url: r.file_url == null ? null : String(r.file_url),
      link_url: r.link_url == null ? null : String(r.link_url),
      file_name: r.file_name == null ? null : String(r.file_name),
      file_type: r.file_type == null ? null : String(r.file_type),
      description: r.description == null ? null : String(r.description),
      reviews: reviewSingle as ReviewJoin,
    };
  });

  const nameByArtifactId = new Map(
    artifactsList.map((a) => [a.id, a.name] as const)
  );

  const historyByArtifactId: Record<string, ProjectArtifactHistoryVersion[]> =
    {};

  for (const aid of artifactIds) {
    const list = parsed.filter((x) => x.artifact_id === aid);
    list.sort((a, b) => compareVersions(b.version_number, a.version_number));
    historyByArtifactId[aid] = list.map((v) => {
      const rt = v.reviews?.review_type ?? null;
      const snapshot = snapshotByArtifactId.get(v.artifact_id);
      return {
        versionId: v.id,
        artifactId: v.artifact_id,
        versionNumber: v.version_number,
        versionCreatedAt: v.created_at,
        reviewId: v.review_id,
        reviewTitle: v.reviews?.title ? String(v.reviews.title) : null,
        reviewStatus: v.reviews?.status ? String(v.reviews.status) : null,
        reviewType: rt,
        fileUrl: v.file_url,
        linkUrl: v.link_url,
        fileName: v.file_name,
        fileType: v.file_type,
        description: v.description,
        decisionSummary: decisionSummaryFromReview(v.reviews),
        feedbackCount: 0,
        reviewerPeople: [],
        snapshot_url: snapshot?.snapshot_url ?? null,
        snapshot_captured_at: snapshot?.snapshot_captured_at ?? null,
      };
    });
  }

  const allReviewIds = [
    ...new Set(
      parsed.map((v) => v.review_id).filter((id): id is string => Boolean(id))
    ),
  ];

  let feedbackCountByReview = new Map<string, number>();
  if (allReviewIds.length > 0) {
    const { data: fbRows } = await supabase
      .from("reviewer_feedback")
      .select("review_id, reviewer_id")
      .eq("status", "submitted")
      .in("review_id", allReviewIds);

    for (const row of fbRows ?? []) {
      const o = row as Record<string, unknown>;
      const rid = String(o.review_id ?? "");
      if (!rid) continue;
      feedbackCountByReview.set(rid, (feedbackCountByReview.get(rid) ?? 0) + 1);
    }
  }

  const assignedByReview = new Map<string, string[]>();
  for (const v of parsed) {
    const rid = v.review_id;
    if (!rid || !v.reviews) continue;
    if (!assignedByReview.has(rid)) {
      assignedByReview.set(rid, normContributorIds(v.reviews.reviewer_contributor_ids));
    }
  }

  const reviewerIdsAll = new Set<string>();
  const feedbackReviewersByReview = new Map<string, string[]>();
  if (allReviewIds.length > 0) {
    const { data: fbRows2 } = await supabase
      .from("reviewer_feedback")
      .select("review_id, reviewer_id")
      .eq("status", "submitted")
      .in("review_id", allReviewIds);

    for (const row of fbRows2 ?? []) {
      const o = row as Record<string, unknown>;
      const rid = String(o.review_id ?? "");
      const cid = String(o.reviewer_id ?? "");
      if (!rid || !cid) continue;
      const list = feedbackReviewersByReview.get(rid) ?? [];
      if (!list.includes(cid)) list.push(cid);
      feedbackReviewersByReview.set(rid, list);
      reviewerIdsAll.add(cid);
    }
  }

  for (const ids of assignedByReview.values()) {
    for (const id of ids) reviewerIdsAll.add(id);
  }

  const reviewersByReview = new Map<string, string[]>();
  for (const rid of allReviewIds) {
    const assigned = assignedByReview.get(rid) ?? [];
    const fromFb = feedbackReviewersByReview.get(rid) ?? [];
    const merged = mergeReviewerIds(assigned, fromFb);
    reviewersByReview.set(rid, merged);
    for (const id of merged) reviewerIdsAll.add(id);
  }

  const contributorById = new Map<
    string,
    { name: string; avatarUrl: string | null }
  >();
  if (reviewerIdsAll.size > 0) {
    const { data: contrib } = await supabase
      .from("contributors")
      .select("id, name")
      .in("id", [...reviewerIdsAll]);

    for (const row of contrib ?? []) {
      const o = row as Record<string, unknown>;
      const id = String(o.id ?? "");
      contributorById.set(id, {
        name: String(o.name ?? ""),
        avatarUrl: null,
      });
    }
  }

  for (const aid of artifactIds) {
    const list = historyByArtifactId[aid];
    if (!list) continue;
    historyByArtifactId[aid] = list.map((entry) => {
      const rid = entry.reviewId;
      const count = rid ? feedbackCountByReview.get(rid) ?? 0 : 0;
      const ids = rid ? reviewersByReview.get(rid) ?? [] : [];
      const reviewerPeople = ids.map((id) => {
        const c = contributorById.get(id);
        return {
          id,
          name: c?.name ?? "Reviewer",
          avatarUrl: c?.avatarUrl ?? null,
        };
      });
      return {
        ...entry,
        feedbackCount: count,
        reviewerPeople,
      };
    });
  }

  const reviewTypeOrder: Record<
    NonNullable<ProjectArtifactOverviewRow["reviewTypeKey"]>,
    number
  > = {
    compare: 0,
    approve: 1,
    align: 2,
    critique: 3,
  };

  const overview: ProjectArtifactOverviewRow[] = parsed
    .map((v) => {
      const rid = v.review_id ?? null;
      const count = rid ? feedbackCountByReview.get(rid) ?? 0 : 0;
      const rawType = v.reviews?.review_type ?? null;
      const reviewTypeKey = normReviewTypeKey(rawType);
      return {
        artifactId: v.artifact_id,
        artifactName: nameByArtifactId.get(v.artifact_id) ?? "Untitled artifact",
        versionId: v.id,
        versionNumber: v.version_number,
        reviewId: rid,
        reviewTitle: v.reviews?.title ? String(v.reviews.title) : null,
        reviewStatus: v.reviews?.status ? String(v.reviews.status) : null,
        reviewType: rawType ? normReviewType(String(rawType)) : null,
        reviewTypeKey,
        feedbackCount: count,
      };
    })
    .filter((row) => row.reviewTypeKey !== null)
    .sort((a, b) => {
      const orderDiff =
        reviewTypeOrder[a.reviewTypeKey!] - reviewTypeOrder[b.reviewTypeKey!];
      if (orderDiff !== 0) return orderDiff;
      const versionDiff = compareVersions(a.versionNumber, b.versionNumber);
      if (versionDiff !== 0) return versionDiff;
      return a.artifactName.localeCompare(b.artifactName);
    });

  return { overview, historyByArtifactId };
}
