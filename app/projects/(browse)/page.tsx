import { ProjectsView } from "@/components/ProjectsView";
import { resolveClientDisplayName } from "@/lib/projects/resolveClientDisplayName";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { isAssignedReviewerScope } from "@/lib/workspace/permissions";
import {
  getAssignedReviewerProjectIds,
  getWorkspaceMembershipForCurrentUser,
} from "@/lib/workspace/resolveWorkspaceMembership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Project, ProjectStatus, ProjectsByStatus } from "@/types/project";
import {
  bucketReviewStatusForProjectCard,
  emptyProjectReviewStatusBreakdown,
  type ProjectReviewStatusBreakdown,
} from "@/lib/reviews/projectReviewStatusBreakdown";

export const dynamic = "force-dynamic";

function normalizeStatus(raw: string | null | undefined): ProjectStatus {
  const s = String(raw ?? "active").toLowerCase();
  if (s === "paused" || s === "complete") return s;
  return "active";
}

export default async function ProjectsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const activeWorkspaceId = getActiveWorkspaceIdFromUser(user);

  if (!activeWorkspaceId) {
    return (
      <ProjectsView
        grouped={{ active: [], paused: [], complete: [] }}
        reviewCounts={{}}
        reviewBreakdowns={{}}
        searchPlaceholder="Filter by project, group, or teammate..."
        workspaceEmptyMessage="Set up your workspace to see projects."
      />
    );
  }

  const membership = await getWorkspaceMembershipForCurrentUser();

  const { data, error } = await supabase
    .from("projects")
    .select(
      `
      id,
      name,
      client,
      client_id,
      description,
      status,
      created_at,
      clients ( id, name ),
      contributors ( id, name )
    `
    )
    .eq("workspace_id", activeWorkspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen px-8 py-16" style={{ backgroundColor: "#faf8f6" }}>
        <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">Could not load projects</p>
          <p className="mt-2 text-amber-800">{error.message}</p>
          <p className="mt-4 text-amber-800">
            If you have not created the <code className="rounded bg-amber-100 px-1">projects</code>{" "}
            table yet, run the SQL in{" "}
            <code className="rounded bg-amber-100 px-1">supabase/migrations/20260411000000_projects.sql</code>{" "}
            in the Supabase SQL editor, then refresh this page.
          </p>
        </div>
      </div>
    );
  }

  let rows = data ?? [];

  if (
    isAssignedReviewerScope(
      membership.workspacePermissionLevel,
      membership.reviewerType,
    ) &&
    membership.userId &&
    activeWorkspaceId
  ) {
    const allowedProjectIds = new Set(
      await getAssignedReviewerProjectIds(
        supabase,
        activeWorkspaceId,
        membership.userId,
      ),
    );
    rows = rows.filter((row) =>
      allowedProjectIds.has(String((row as Record<string, unknown>).id ?? "")),
    );
  }

  const teammateLabelOk =
    rows.length === 0 ||
    (rows[0] != null && Object.prototype.hasOwnProperty.call(rows[0], "contributors"));
  const searchPlaceholder = teammateLabelOk
    ? "Filter by project, group, or teammate..."
    : "Filter by project or group...";

  function contributorsFromRow(r: Record<string, unknown>): Project["contributors"] {
    const raw = r.contributors;
    if (!Array.isArray(raw)) return [];

    const contributors: Project["contributors"] = [];
    for (const c of raw) {
      const o = c as Record<string, unknown>;
      const id = String(o.id ?? "").trim();
      const name = String(o.name ?? "").trim();
      if (!id || !name) continue;
      contributors.push({
        id,
        name,
        email: null,
        role: null,
        avatarUrl: null,
      });
    }
    return contributors;
  }

  const projects: Project[] = rows.map((row) => {
    const r = row as Record<string, unknown>;
    const contributors = contributorsFromRow(r);
    const descRaw = r.description;
    const description =
      descRaw == null
        ? null
        : String(descRaw).trim().length > 0
          ? String(descRaw).trim()
          : null;
    const clientRaw = r.client;
    const client = resolveClientDisplayName(
      clientRaw == null ? null : String(clientRaw),
      r.clients,
    );
    return {
      id: String(r.id),
      name: String(r.name ?? ""),
      client,
      description,
      status: normalizeStatus(r.status as string | undefined),
      created_at: String(r.created_at ?? ""),
      contributors,
      contributor_names: contributors.map((c) => c.name),
    };
  });

  const grouped: ProjectsByStatus = {
    active: projects.filter((p) => p.status === "active"),
    paused: projects.filter((p) => p.status === "paused"),
    complete: projects.filter((p) => p.status === "complete")
  };

  const reviewCounts: Record<string, number> = {};
  const reviewBreakdowns: Record<string, ProjectReviewStatusBreakdown> = {};

  const { data: reviewRows, error: reviewsError } = await supabase
    .from("reviews")
    .select("project_id, status, projects!inner(workspace_id)")
    .eq("projects.workspace_id", activeWorkspaceId);

  if (!reviewsError && reviewRows) {
    const visibleProjectIds = new Set(projects.map((project) => project.id));

    for (const row of reviewRows) {
      const r = row as { project_id?: string; status?: string | null };
      const pid = String(r.project_id ?? "");
      if (!pid || !visibleProjectIds.has(pid)) continue;

      reviewCounts[pid] = (reviewCounts[pid] ?? 0) + 1;

      const breakdown = reviewBreakdowns[pid] ?? emptyProjectReviewStatusBreakdown();
      const bucket = bucketReviewStatusForProjectCard(r.status);
      breakdown[bucket] += 1;
      reviewBreakdowns[pid] = breakdown;
    }
  }

  return (
    <ProjectsView
      grouped={grouped}
      reviewCounts={reviewCounts}
      reviewBreakdowns={reviewBreakdowns}
      searchPlaceholder={searchPlaceholder}
    />
  );
}
