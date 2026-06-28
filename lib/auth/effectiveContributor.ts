import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDevImpersonatedContributorId } from "@/lib/auth/devImpersonation";
import {
  resolveEffectiveContributor,
  type ContributorIdentity,
} from "@/lib/auth/resolveEffectiveContributor";

export type { ContributorIdentity };

async function findContributorByIdWithClient(
  contributorsSupabase: SupabaseClient,
  contributorId: string,
  projectId?: string,
): Promise<ContributorIdentity | null> {
  let query = contributorsSupabase
    .from("contributors")
    .select("id, name, role, permission_level")
    .eq("id", contributorId);
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data } = await query.maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Contributor"),
    role: row.role == null ? null : String(row.role),
    permissionLevel:
      row.permission_level == null ? null : String(row.permission_level),
  };
}

async function resolveContributorWithServiceClient(
  sessionSupabase: SupabaseClient,
  contributorsSupabase: SupabaseClient,
  projectId: string | undefined,
  impersonatedContributorId: string | null,
): Promise<ContributorIdentity | null> {
  const trimmed = impersonatedContributorId?.trim() || null;
  if (trimmed) {
    const contributor = await findContributorByIdWithClient(
      contributorsSupabase,
      trimmed,
      projectId,
    );
    if (contributor) return contributor;
  }

  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();
  const email = user?.email?.trim().toLowerCase();
  if (!email) return null;

  let query = contributorsSupabase
    .from("contributors")
    .select("id, name, email, role, permission_level")
    .ilike("email", email);
  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: rows } = await query
    .order("created_at", { ascending: true })
    .limit(1);
  const data = rows?.[0] ?? null;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Contributor"),
    role: row.role == null ? null : String(row.role),
    permissionLevel:
      row.permission_level == null ? null : String(row.permission_level),
  };
}

export async function getEffectiveCurrentContributor(
  supabase: SupabaseClient,
  projectId?: string,
  adminClient?: SupabaseClient,
): Promise<ContributorIdentity | null> {
  const devContributorId = await getDevImpersonatedContributorId();
  if (adminClient) {
    return resolveContributorWithServiceClient(
      supabase,
      adminClient,
      projectId,
      devContributorId,
    );
  }
  return resolveEffectiveContributor(supabase, projectId, devContributorId);
}
