import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves contributor ids to display names via the `contact_names` view
 * (backed by `contributors`).
 */
export async function fetchContactDisplayNames(
  supabase: SupabaseClient,
  ids: readonly string[]
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(
      ids.map((id) => String(id ?? "").trim()).filter(Boolean)
    ),
  ];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from("contact_names")
    .select("id, display_name")
    .in("id", unique);

  if (error || !Array.isArray(data)) return map;

  for (const row of data as { id?: unknown; display_name?: unknown }[]) {
    const id = row.id == null ? "" : String(row.id);
    const name =
      row.display_name == null ? "" : String(row.display_name).trim();
    if (id && name) map.set(id, name);
  }
  return map;
}

export function contactNameFromMap(
  map: ReadonlyMap<string, string> | Record<string, string> | undefined,
  id: string | null | undefined,
  fallback: string
): string {
  if (id == null || String(id).trim() === "") return fallback;
  const key = String(id).trim();
  if (map instanceof Map) {
    const v = map.get(key)?.trim();
    return v || fallback;
  }
  if (map && typeof map === "object" && key in map) {
    const raw = (map as Record<string, string>)[key];
    const v = raw?.trim();
    return v || fallback;
  }
  return fallback;
}
