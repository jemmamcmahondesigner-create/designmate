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
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Contributor"),
    role: row.role == null ? null : String(row.role),
    permissionLevel:
      row.permission_level == null ? null : String(row.permission_level),
  } satisfies ContributorIdentity;
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

  let query = supabase
    .from("contributors")
    .select("id, name, email, role, permission_level")
    .ilike("email", email);
  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data } = await query.limit(1).maybeSingle();
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
