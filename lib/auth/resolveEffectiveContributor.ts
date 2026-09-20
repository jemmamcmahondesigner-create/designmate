import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEV_IMPERSONATION_COOKIE,
  isDevImpersonationEnabled,
} from "@/lib/auth/devImpersonationShared";

export type ContributorIdentity = {
  id: string;
  name: string;
  role: string | null;
  permissionLevel: string | null;
};

const CONTRIBUTOR_IDENTITY_SELECT = "id, name, email, role, permission_level";

function mapContributorIdentity(row: Record<string, unknown>): ContributorIdentity {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Contributor"),
    role: row.role == null ? null : String(row.role),
    permissionLevel:
      row.permission_level == null ? null : String(row.permission_level),
  };
}

async function workspaceIdForProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .maybeSingle();
  const workspaceId = String(
    (data as { workspace_id?: string | null } | null)?.workspace_id ?? "",
  ).trim();
  return workspaceId || null;
}

/**
 * Real-login identity: project-scoped row first, then workspace-level row in
 * that project's workspace. Does not change the result when a project-scoped
 * row already exists. Unscoped (no projectId) keeps the existing email-only lookup.
 */
export async function resolveContributorByEmail(
  supabase: SupabaseClient,
  email: string,
  projectId: string | undefined,
): Promise<ContributorIdentity | null> {
  if (projectId) {
    const { data: projectRows } = await supabase
      .from("contributors")
      .select(CONTRIBUTOR_IDENTITY_SELECT)
      .ilike("email", email)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1);
    const projectRow = projectRows?.[0] ?? null;
    if (projectRow) {
      return mapContributorIdentity(projectRow as Record<string, unknown>);
    }

    const workspaceId = await workspaceIdForProject(supabase, projectId);
    if (!workspaceId) return null;

    const { data: workspaceRows } = await supabase
      .from("contributors")
      .select(CONTRIBUTOR_IDENTITY_SELECT)
      .ilike("email", email)
      .eq("workspace_id", workspaceId)
      .is("project_id", null)
      .order("created_at", { ascending: true })
      .limit(1);
    const workspaceRow = workspaceRows?.[0] ?? null;
    if (!workspaceRow) return null;
    return mapContributorIdentity(workspaceRow as Record<string, unknown>);
  }

  const { data: rows } = await supabase
    .from("contributors")
    .select(CONTRIBUTOR_IDENTITY_SELECT)
    .ilike("email", email)
    .order("created_at", { ascending: true })
    .limit(1);
  const data = rows?.[0] ?? null;
  if (!data) return null;
  return mapContributorIdentity(data as Record<string, unknown>);
}

async function findContributorById(
  supabase: SupabaseClient,
  contributorId: string,
  projectId?: string
) {
  let query = supabase
    .from("contributors")
    .select("id, name, role, permission_level")
    .eq("id", contributorId);
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data } = await query.maybeSingle();
  if (!data) return null;
  return mapContributorIdentity(data as Record<string, unknown>);
}

/**
 * Resolves the same contributor identity as `getEffectiveCurrentContributor` on the server:
 * dev cookie contributor id first (when non-null), else Supabase auth email → `contributors`.
 */
export async function resolveEffectiveContributor(
  supabase: SupabaseClient,
  projectId: string | undefined,
  impersonatedContributorId: string | null
): Promise<ContributorIdentity | null> {
  const trimmed = impersonatedContributorId?.trim() || null;
  if (trimmed) {
    const contributor = await findContributorById(supabase, trimmed);
    if (contributor) return contributor;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.trim().toLowerCase();
  if (!email) return null;

  return resolveContributorByEmail(supabase, email, projectId);
}

/** Read dev impersonation cookie in the browser (cookie is not httpOnly). */
export function readDevImpersonationContributorIdFromBrowser(): string | null {
  if (typeof document === "undefined") return null;
  if (!isDevImpersonationEnabled()) return null;
  const prefix = `${DEV_IMPERSONATION_COOKIE}=`;
  const parts = document.cookie.split(";").map((c) => c.trim());
  for (const p of parts) {
    if (p.startsWith(prefix)) {
      let v = p.slice(prefix.length).trim();
      try {
        v = decodeURIComponent(v);
      } catch {
        /* keep raw */
      }
      return v.trim() || null;
    }
  }
  return null;
}
