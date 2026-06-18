import { AllReviewsView, type AllReviewsGroupedByType } from "@/components/AllReviewsView";
import { getEffectiveCurrentContributor } from "@/lib/auth/effectiveContributor";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { isAssignedReviewerScope } from "@/lib/workspace/permissions";
import { getWorkspaceMembershipForCurrentUser } from "@/lib/workspace/resolveWorkspaceMembership";
import { formatDistanceToNow } from "@/lib/formatDistanceToNow";
import {
  buildReviewCardReviewers,
  fetchReviewCardMeta,
  resolveReviewCardCreator,
  resolveReviewCardCreatorId,
} from "@/lib/reviews/fetchProjectReviews";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReviewTypeBucket = "compare" | "approve" | "critique" | "align";

function reviewTypeBucket(raw: unknown): ReviewTypeBucket {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "approve" || value === "critique" || value === "align") {
    return value;
  }
  return "compare";
}

function projectJoinHasContributorsKey(raw: unknown): boolean {
  const row = Array.isArray(raw) ? raw[0] : raw;
  return (
    row != null &&
    typeof row === "object" &&
    Object.prototype.hasOwnProperty.call(row, "contributors")
  );
}

function contributorNamesFromProjectJoin(raw: unknown): string[] {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") return [];
  const contribs = (row as Record<string, unknown>).contributors;
  if (!Array.isArray(contribs)) return [];
  return contribs
    .map((c) => String((c as Record<string, unknown>).name ?? "").trim())
    .filter(Boolean);
}

function toProjectMeta(
  raw: unknown
): { projectName: string; clientName: string | null } {
  if (Array.isArray(raw)) {
    const first = raw[0] as Record<string, unknown> | undefined;
    return {
      projectName: String(first?.name ?? "Project"),
      clientName:
        first?.client == null || String(first.client).trim() === ""
          ? null
          : String(first.client)
    };
  }
  const row = raw as Record<string, unknown> | null;
  return {
    projectName: String(row?.name ?? "Project"),
    clientName:
      row?.client == null || String(row.client).trim() === ""
        ? null
        : String(row.client)
  };
}

export default async function AllReviewsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const activeWorkspaceId = getActiveWorkspaceIdFromUser(user);

  if (!activeWorkspaceId) {
    return (
      <AllReviewsView
        grouped={{ compare: [], approve: [], critique: [], align: [] }}
        searchPlaceholder="Filter by project, client, or teammate..."
      />
    );
  }

  const membership = await getWorkspaceMembershipForCurrentUser();
  const contributor = await getEffectiveCurrentContributor(supabase);
  const byId = new Map<string, Record<string, unknown>>();

  const reviewSelect = `
    id,
    title,
    review_type,
    status,
    decision_status,
    require_decision_maker,
    decision_comments,
    decision_text,
    owner_display_name,
    creator_id,
    created_at,
    updated_at,
    review_focus,
    reviewer_contributor_ids,
    project_id,
    projects!inner (
      id,
      name,
      client,
      status,
      workspace_id,
      contributors ( name )
    )
  `;

  const assignedReviewerScope = isAssignedReviewerScope(
    membership.workspacePermissionLevel,
    membership.reviewerType,
  );

  if (!assignedReviewerScope) {
    const { data: workspaceReviews } = await supabase
      .from("reviews")
      .select(reviewSelect)
      .eq("projects.workspace_id", activeWorkspaceId)
      .eq("projects.status", "active");

    for (const row of workspaceReviews ?? []) {
      const cast = row as Record<string, unknown>;
      const id = String(cast.id ?? "");
      if (id) byId.set(id, cast);
    }
  }

  if (assignedReviewerScope && contributor?.id) {
    const { data: reviewerRows } = await supabase
      .from("reviews")
      .select(reviewSelect)
      .contains("reviewer_contributor_ids", [contributor.id])
      .eq("projects.workspace_id", activeWorkspaceId)
      .eq("projects.status", "active");
    for (const row of reviewerRows ?? []) {
      const cast = row as Record<string, unknown>;
      const id = String(cast.id ?? "");
      if (id) byId.set(id, cast);
    }
  }

  const grouped: AllReviewsGroupedByType = {
    compare: [],
    approve: [],
    critique: [],
    align: []
  };

  const sorted = [...byId.values()].sort((a, b) => {
    const aDate = new Date(String(a.updated_at ?? a.created_at ?? 0)).getTime();
    const bDate = new Date(String(b.updated_at ?? b.created_at ?? 0)).getTime();
    return bDate - aDate;
  });

  const teammateLabelOk =
    sorted.length === 0 || projectJoinHasContributorsKey(sorted[0].projects);
  const searchPlaceholder = teammateLabelOk
    ? "Filter by project, client, or teammate..."
    : "Filter by project or client...";
  const reviewerIds = [...new Set(
    sorted.flatMap((review) =>
      Array.isArray(review.reviewer_contributor_ids)
        ? (review.reviewer_contributor_ids as unknown[])
            .map((id) => String(id).trim())
            .filter(Boolean)
        : [],
    ),
  )];
  const creatorIds = [...new Set(
    sorted
      .map((review) => String(review.creator_id ?? "").trim())
      .filter(Boolean),
  )];
  const { reviewerResolutionByRawId, countsByReviewId } = await fetchReviewCardMeta(supabase, {
    reviewIds: sorted.map((review) => String(review.id ?? "").trim()).filter(Boolean),
    reviewerIds,
    creatorIds,
    workspaceId: activeWorkspaceId,
  });
  for (const review of sorted) {
    const bucket = reviewTypeBucket(review.review_type);
    const updatedDate = new Date(String(review.updated_at ?? review.created_at ?? ""));
    const updatedAgo = Number.isNaN(updatedDate.getTime())
      ? ""
      : formatDistanceToNow(updatedDate, { addSuffix: true });
    const projectMeta = toProjectMeta(review.projects);
    const reviewers = buildReviewCardReviewers(
      review.reviewer_contributor_ids,
      reviewerResolutionByRawId,
    );

    grouped[bucket].push({
      id: String(review.id ?? ""),
      title: String(review.title ?? "Untitled"),
      status: String(review.status ?? "in-review"),
      decision_status:
        review.decision_status == null ? null : String(review.decision_status),
      require_decision_maker: Boolean(review.require_decision_maker),
      updated_ago: updatedAgo,
      date_tooltip_iso:
        review.created_at == null ? null : String(review.created_at),
      project_id: String(review.project_id ?? "").trim(),
      project_name: projectMeta.projectName,
      client_name: projectMeta.clientName,
      description:
        review.review_focus == null ? null : String(review.review_focus).trim() || null,
      owner_display_name:
        review.owner_display_name == null
          ? null
          : String(review.owner_display_name).trim() || null,
      creator_id: resolveReviewCardCreatorId(review.creator_id, reviewerResolutionByRawId) ?? null,
      creator_email:
        resolveReviewCardCreator(review.creator_id, reviewerResolutionByRawId)?.email ?? null,
      creator_user_id:
        resolveReviewCardCreator(review.creator_id, reviewerResolutionByRawId)?.userId ?? null,
      feedback_count: countsByReviewId.get(String(review.id ?? "").trim())?.feedbackCount ?? 0,
      change_request_count:
        countsByReviewId.get(String(review.id ?? "").trim())?.changeRequestCount ?? 0,
      contributor_names: contributorNamesFromProjectJoin(review.projects),
      reviewers,
    });
  }

  if (!byId.size) {
    return (
      <AllReviewsView
        grouped={{ compare: [], approve: [], critique: [], align: [] }}
        searchPlaceholder={searchPlaceholder}
      />
    );
  }

  return <AllReviewsView grouped={grouped} searchPlaceholder={searchPlaceholder} />;
}
