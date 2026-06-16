import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectClientFields = {
  client: string | null;
  client_id: string | null;
};

/**
 * Resolves projects.client (text) and projects.client_id (FK) for inserts/updates.
 * Pass clientId when the UI selects a client row; pass clientName for free-text legacy flows.
 */
export async function resolveProjectClientFields(
  supabase: SupabaseClient,
  input: {
    clientId?: string | null;
    clientName?: string | null;
    workspaceId?: string | null;
  },
): Promise<ProjectClientFields> {
  const workspaceId = input.workspaceId?.trim() || null;
  const clientId = input.clientId?.trim() || null;

  if (clientId) {
    let lookup = supabase.from("clients").select("id, name").eq("id", clientId);
    if (workspaceId) {
      lookup = lookup.eq("workspace_id", workspaceId);
    }
    const { data, error } = await lookup.maybeSingle();

    if (error) {
      console.error("clients lookup by id error:", error);
      return { client: input.clientName?.trim() || null, client_id: clientId };
    }

    if (data) {
      const o = data as Record<string, unknown>;
      return {
        client: String(o.name ?? "").trim() || null,
        client_id: String(o.id ?? clientId),
      };
    }
  }

  const clientName = input.clientName?.trim() || null;
  if (!clientName) return { client: null, client_id: null };

  let nameLookup = supabase.from("clients").select("id, name");
  if (workspaceId) {
    nameLookup = nameLookup.eq("workspace_id", workspaceId);
  }
  const { data: clientRows, error } = await nameLookup;

  if (error) {
    console.error("clients lookup error:", error);
    return { client: clientName, client_id: null };
  }

  const normalized = clientName.toLowerCase();
  const match = (clientRows ?? []).find((row) => {
    const o = row as Record<string, unknown>;
    return String(o.name ?? "").trim().toLowerCase() === normalized;
  });

  const matchedId = match ? String((match as Record<string, unknown>).id ?? "") : "";
  return { client: clientName, client_id: matchedId || null };
}
