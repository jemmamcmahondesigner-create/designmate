import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCanonicalContributorIds } from "@/lib/contributors/resolveCanonicalContributorIds";
import type { ProjectContributor } from "@/types/project";

function mapContributorRow(
  row: Record<string, unknown>,
  canonicalId: string,
): ProjectContributor {
  const email = row.email;
  const role = row.role;
  const avatarRaw = row.avatar_url ?? row.avatarUrl;
  const avatarUrl =
    avatarRaw == null || String(avatarRaw).trim() === ""
      ? null
      : String(avatarRaw);

  return {
    id: canonicalId,
    name: String(row.name ?? ""),
    email: email == null || String(email).trim() === "" ? null : String(email),
    role: role == null || String(role).trim() === "" ? null : String(role),
    userId:
      row.user_id == null || String(row.user_id).trim() === ""
        ? null
        : String(row.user_id),
    avatarUrl,
  };
}

/**
 * Project roster for cards and detail chips — one entry per user with the
 * canonical workspace contributors.id (stable avatar colour key).
 */
export async function loadProjectContributorsForDisplay(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectContributor[]> {
  const pid = projectId.trim();
  if (!pid) return [];

  const { data: rows } = await supabase
    .from("contributors")
    .select("id, name, email, role, user_id")
    .eq("project_id", pid)
    .order("created_at", { ascending: true });

  const rawRows = (rows ?? []) as Record<string, unknown>[];
  if (rawRows.length === 0) return [];

  const canonical = await resolveCanonicalContributorIds(
    supabase,
    rawRows.map((row) => String(row.id ?? "")),
  );

  const byUserId = new Map<string, ProjectContributor>();
  const withoutUser: ProjectContributor[] = [];

  for (const row of rawRows) {
    const rawId = String(row.id ?? "").trim();
    if (!rawId) continue;

    const resolved = canonical.get(rawId);
    const canonicalId = resolved?.contributorId ?? rawId;
    const contributor = mapContributorRow(row, canonicalId);
    const userId = contributor.userId?.trim();

    if (userId) {
      if (!byUserId.has(userId)) {
        byUserId.set(userId, contributor);
      }
      continue;
    }

    if (!withoutUser.some((item) => item.id === canonicalId)) {
      withoutUser.push(contributor);
    }
  }

  return [...byUserId.values(), ...withoutUser];
}

/** Canonicalize embedded project-card contributor rows from a projects join. */
export async function canonicalizeProjectCardContributors(
  supabase: SupabaseClient,
  contributors: ProjectContributor[],
): Promise<ProjectContributor[]> {
  if (contributors.length === 0) return [];

  const canonical = await resolveCanonicalContributorIds(
    supabase,
    contributors.map((row) => row.id),
  );

  const byUserId = new Map<string, ProjectContributor>();
  const withoutUser: ProjectContributor[] = [];

  for (const contributor of contributors) {
    const resolved = canonical.get(contributor.id);
    const canonicalId = resolved?.contributorId ?? contributor.id;
    const email = resolved?.email ?? contributor.email;
    const next: ProjectContributor = { ...contributor, id: canonicalId, email };
    const userId = next.userId?.trim();

    if (userId) {
      if (!byUserId.has(userId)) {
        byUserId.set(userId, next);
      }
      continue;
    }

    if (!withoutUser.some((item) => item.id === canonicalId)) {
      withoutUser.push(next);
    }
  }

  return [...byUserId.values(), ...withoutUser];
}
