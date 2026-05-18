import { ProjectsView } from "@/components/ProjectsView";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Project, ProjectStatus, ProjectsByStatus } from "@/types/project";

export const dynamic = "force-dynamic";

function normalizeStatus(raw: string | null | undefined): ProjectStatus {
  const s = String(raw ?? "active").toLowerCase();
  if (s === "paused" || s === "complete") return s;
  return "active";
}

export default async function ProjectsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      `
      id,
      name,
      client,
      description,
      status,
      created_at,
      contributors ( name )
    `
    )
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

  const rows = data ?? [];
  const teammateLabelOk =
    rows.length === 0 ||
    (rows[0] != null && Object.prototype.hasOwnProperty.call(rows[0], "contributors"));
  const searchPlaceholder = teammateLabelOk
    ? "Filter by project, client, or teammate..."
    : "Filter by project or client...";

  function contributorNamesFromRow(r: Record<string, unknown>): string[] {
    const raw = r.contributors;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((c) => String((c as Record<string, unknown>).name ?? "").trim())
      .filter(Boolean);
  }

  const projects: Project[] = rows.map((row) => {
    const r = row as Record<string, unknown>;
    const descRaw = r.description;
    const description =
      descRaw == null
        ? null
        : String(descRaw).trim().length > 0
          ? String(descRaw).trim()
          : null;
    const clientRaw = r.client;
    const client =
      clientRaw == null
        ? null
        : String(clientRaw).trim().length > 0
          ? String(clientRaw).trim()
          : null;
    return {
      id: String(r.id),
      name: String(r.name ?? ""),
      client,
      description,
      status: normalizeStatus(r.status as string | undefined),
      created_at: String(r.created_at ?? ""),
      contributor_names: contributorNamesFromRow(r)
    };
  });

  const grouped: ProjectsByStatus = {
    active: projects.filter((p) => p.status === "active"),
    paused: projects.filter((p) => p.status === "paused"),
    complete: projects.filter((p) => p.status === "complete")
  };

  const reviewCounts: Record<string, number> = {};

  // TODO: when a `reviews` table (with `project_id` → `projects.id`) is migrated, replace this
  // with an efficient count query or RPC instead of fetching all rows.
  const { data: reviewRows, error: reviewsError } = await supabase
    .from("reviews")
    .select("project_id");

  if (!reviewsError && reviewRows) {
    for (const row of reviewRows) {
      const pid = String((row as { project_id?: string }).project_id ?? "");
      if (pid) {
        reviewCounts[pid] = (reviewCounts[pid] ?? 0) + 1;
      }
    }
  }

  return (
    <ProjectsView
      grouped={grouped}
      reviewCounts={reviewCounts}
      searchPlaceholder={searchPlaceholder}
    />
  );
}
