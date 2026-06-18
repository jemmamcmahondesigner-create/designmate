import { notFound } from "next/navigation";
import { ProjectDetailView } from "@/components/project-detail/ProjectDetailView";
import { resolveClientDisplayName } from "@/lib/projects/resolveClientDisplayName";
import { fetchProjectReviewsForCards } from "@/lib/reviews/fetchProjectReviews";
import { loadProjectContributorsForDisplay } from "@/lib/contributors/loadProjectContributorsForDisplay";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { getAssignedReviewerContributorId } from "@/lib/workspace/resolveWorkspaceMembership";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ProjectContributor,
  ProjectProblem,
  ProjectReference,
  ProjectStatus
} from "@/types/project";

export const dynamic = "force-dynamic";

function normalizeStatus(raw: string | null | undefined): ProjectStatus {
  const s = String(raw ?? "active").toLowerCase();
  if (s === "paused" || s === "complete") return s;
  return "active";
}

function mapProblems(rows: unknown): ProjectProblem[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      id: String(o.id ?? ""),
      description: String(o.description ?? "")
    };
  });
}

function mapContributors(rows: unknown): ProjectContributor[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const o = r as Record<string, unknown>;
    const email = o.email;
    const role = o.role;
    const avatarRaw = o.avatar_url ?? o.avatarUrl;
    const avatarUrl =
      avatarRaw == null || String(avatarRaw).trim() === ""
        ? null
        : String(avatarRaw);
    return {
      id: String(o.id ?? ""),
      name: String(o.name ?? ""),
      email: email == null || String(email).trim() === "" ? null : String(email),
      role: role == null || String(role).trim() === "" ? null : String(role),
      userId:
        o.user_id == null || String(o.user_id).trim() === ""
          ? null
          : String(o.user_id),
      avatarUrl
    };
  });
}

function mapReferences(rows: unknown): ProjectReference[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const o = r as Record<string, unknown>;
    const url = o.url;
    const fileName = o.file_name;
    const storagePath = o.storage_path;
    const fileType = o.file_type;
    const createdAt = o.created_at;
    return {
      id: String(o.id ?? ""),
      project_id: String(o.project_id ?? ""),
      label: String(o.label ?? ""),
      url: url == null || String(url).trim() === "" ? null : String(url),
      file_name:
        fileName == null || String(fileName).trim() === ""
          ? null
          : String(fileName),
      storage_path:
        storagePath == null || String(storagePath).trim() === ""
          ? null
          : String(storagePath),
      file_type:
        fileType == null || String(fileType).trim() === ""
          ? null
          : String(fileType),
      created_at:
        createdAt == null || String(createdAt).trim() === ""
          ? new Date(0).toISOString()
          : String(createdAt)
    };
  });
}

export default async function ProjectDetailPage({
  params
}: Readonly<{
  params: { id: string };
}>) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const activeWorkspaceId = getActiveWorkspaceIdFromUser(user);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, client, client_id, description, status, clients ( id, name )")
    .eq("id", params.id)
    .maybeSingle();

  if (projectError || !project) {
    notFound();
  }

  const data = project;

  const r = data as Record<string, unknown>;
  const client = resolveClientDisplayName(
    r.client == null ? null : String(r.client),
    r.clients,
  );
  const clientIdRaw = r.client_id;
  const clientId =
    clientIdRaw == null || String(clientIdRaw).trim() === ""
      ? null
      : String(clientIdRaw).trim();
  const descRaw = r.description;
  const description =
    descRaw == null
      ? null
      : String(descRaw).trim() === ""
        ? null
        : String(descRaw).trim();

  const [
    { data: problemsRows },
    initialContributors,
    { data: referencesRows },
    { data: recentProjectsRows },
    initialReviews
  ] = await Promise.all([
    supabase
      .from("problems")
      .select("id, description")
      .eq("project_id", params.id)
      .is("review_id", null)
      .order("created_at", { ascending: true }),
    loadProjectContributorsForDisplay(supabase, params.id),
    supabase
      .from("project_references")
      .select("id, project_id, label, url, file_name, storage_path, file_type, created_at")
      .eq("project_id", params.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, client, status")
      .eq("status", "active")
      .neq("id", params.id)
      .order("name", { ascending: true })
      .limit(5),
    fetchProjectReviewsForCards(supabase, params.id, {
      assignedReviewerContributorId: await getAssignedReviewerContributorId(supabase),
      workspaceId: activeWorkspaceId,
    })
  ]);

  const recentProjects = Array.isArray(recentProjectsRows)
    ? recentProjectsRows.map((row) => {
        const o = row as Record<string, unknown>;
        const clientValue = o.client;
        return {
          id: String(o.id ?? ""),
          name: String(o.name ?? ""),
          client:
            clientValue == null || String(clientValue).trim() === ""
              ? null
              : String(clientValue)
        };
      })
    : [];

  return (
    <ProjectDetailView
      activeTab="overview"
      project={{
        id: String(r.id),
        name: String(r.name ?? ""),
        client,
        clientId,
        description,
        status: normalizeStatus(r.status as string | undefined)
      }}
      recentProjects={recentProjects}
      initialProblems={mapProblems(problemsRows)}
      initialContributors={initialContributors}
      initialReferences={mapReferences(referencesRows)}
      initialReviews={initialReviews}
    />
  );
}
