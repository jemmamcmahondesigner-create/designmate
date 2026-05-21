import type { SupabaseClient } from "@supabase/supabase-js";

/** Global seed roles in contributor_roles — only these are inserted into that table. */
export const BASE_CONTRIBUTOR_ROLE_NAMES = [
  "Designer",
  "Product Manager",
  "Engineer",
  "Stakeholder",
] as const;

const BASE_ROLE_NAME_KEYS = new Set(
  BASE_CONTRIBUTOR_ROLE_NAMES.map((n) => n.toLowerCase()),
);

export const WORKSPACE_ROLE_PREFIX = "__role__:";

export type RoleOption = { id: string; name: string };

export function titleCaseRoleName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function workspaceRoleValue(name: string): string {
  return `${WORKSPACE_ROLE_PREFIX}${encodeURIComponent(name.trim())}`;
}

export function parseWorkspaceRoleValue(value: string): string | null {
  if (!value.startsWith(WORKSPACE_ROLE_PREFIX)) return null;
  try {
    return decodeURIComponent(value.slice(WORKSPACE_ROLE_PREFIX.length));
  } catch {
    return null;
  }
}

/**
 * Base contributor_roles plus distinct contributors.role values for the workspace.
 * Custom workspace roles are not read from other workspaces.
 */
export async function fetchWorkspaceRoleOptions(
  supabase: SupabaseClient,
  workspaceId: string | null,
): Promise<RoleOption[]> {
  const { data: globalRows, error: globalError } = await supabase
    .from("contributor_roles")
    .select("id, name")
    .order("name", { ascending: true });

  if (globalError) {
    console.error("contributor_roles fetch error:", globalError);
    return [];
  }

  const byKey = new Map<string, RoleOption>();
  for (const row of globalRows ?? []) {
    const o = row as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    if (!name) continue;
    byKey.set(name.toLowerCase(), { id: name, name });
  }

  if (workspaceId) {
    const { data: contributorRows, error: contribError } = await supabase
      .from("contributors")
      .select("role")
      .eq("workspace_id", workspaceId)
      .not("role", "is", null)
      .neq("role", "");

    if (contribError) {
      console.error("contributors role fetch error:", contribError);
    } else {
      for (const row of contributorRows ?? []) {
        const role = String((row as Record<string, unknown>).role ?? "").trim();
        if (!role) continue;
        const key = role.toLowerCase();
        if (!byKey.has(key)) {
          byKey.set(key, { id: role, name: role });
        }
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Ensures a base seed role exists in contributor_roles.
 * Custom roles (e.g. "Product Owner") are workspace-scoped via contributors.role only.
 */
export async function ensureContributorRole(
  supabase: SupabaseClient,
  typed: string,
): Promise<{ id: string; name: string } | null> {
  const name = titleCaseRoleName(typed);
  if (!name) return null;

  if (!BASE_ROLE_NAME_KEYS.has(name.toLowerCase())) {
    return { id: name, name };
  }

  const { data, error } = await supabase
    .from("contributor_roles")
    .insert({ name })
    .select("id, name")
    .single();

  if (!error && data && typeof data === "object" && "id" in data) {
    const id = String((data as Record<string, unknown>).id ?? "");
    const label = String((data as Record<string, unknown>).name ?? name);
    if (id) return { id: label, name: label };
  }

  if (error && String((error as { code?: string }).code) === "23505") {
    const { data: existing } = await supabase
      .from("contributor_roles")
      .select("id, name")
      .eq("name", name)
      .maybeSingle();
    if (existing && typeof existing === "object" && "name" in existing) {
      const label = String((existing as Record<string, unknown>).name ?? name).trim();
      if (label) return { id: label, name: label };
    }
  }

  return null;
}
