import { notFound } from "next/navigation";
import { ProjectDetailView } from "@/components/project-detail/ProjectDetailView";
import { fetchProjectReviewsForCards } from "@/lib/reviews/fetchProjectReviews";
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
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, client, client_id, description, status")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const r = data as Record<string, unknown>;
  const clientRaw = r.client;
  const client =
    clientRaw == null
      ? null
      : String(clientRaw).trim() === ""
        ? null
        : String(clientRaw).trim();
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
    { data: contributorsRows },
    { data: referencesRows },
    { data: recentProjectsRows },
    initialReviews
  ] = await Promise.all([
    supabase
      .from("problems")
      .select("id, description")
      .eq("project_id", params.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("contributors")
      .select("id, name, email, role")
      .eq("project_id", params.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_references")
      .select("id, project_id, label, url, file_name, created_at")
      .eq("project_id", params.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name, client, status")
      .eq("status", "active")
      .neq("id", params.id)
      .order("name", { ascending: true })
      .limit(5),
    fetchProjectReviewsForCards(supabase, params.id)
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
      initialContributors={mapContributors(contributorsRows)}
      initialReferences={mapReferences(referencesRows)}
      initialReviews={initialReviews}
    />
  );
}
