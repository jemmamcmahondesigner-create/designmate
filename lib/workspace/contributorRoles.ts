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
 * Built-in defaults (workspace_id null) plus custom roles for this workspace.
 * RLS may return roles from every workspace the user belongs to; this filter
 * keeps pickers aligned with the Roles page for the active workspace.
 */
export async function fetchWorkspaceRoleOptions(
  supabase: SupabaseClient,
  workspaceId: string | null,
): Promise<RoleOption[]> {
  const { data: globalRows, error: globalError } = await supabase
    .from("contributor_roles")
    .select("id, name, workspace_id")
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
    const roleWorkspaceId =
      o.workspace_id == null || String(o.workspace_id).trim() === ""
        ? null
        : String(o.workspace_id);
    if (roleWorkspaceId != null && roleWorkspaceId !== workspaceId) continue;
    byKey.set(name.toLowerCase(), { id: name, name });
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolves a typed job title against contributor_roles.
 * Built-in defaults are looked up, never inserted (they are workspace_id NULL).
 * Custom roles stay on contributors.role unless created from the Roles screen.
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

  const { data: existing } = await supabase
    .from("contributor_roles")
    .select("id, name")
    .eq("name", name)
    .is("workspace_id", null)
    .maybeSingle();
  if (existing && typeof existing === "object" && "name" in existing) {
    const label = String((existing as Record<string, unknown>).name ?? name).trim();
    if (label) return { id: label, name: label };
  }

  return { id: name, name };
}
