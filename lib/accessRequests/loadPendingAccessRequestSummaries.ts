import type { SupabaseClient } from "@supabase/supabase-js";

export type PendingAccessRequestSummary = {
  count: number;
  requesterNames: string[];
};

async function resolveContributorNames(
  supabase: SupabaseClient,
  contributorIds: string[],
): Promise<string[]> {
  const uniqueIds = [...new Set(contributorIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const { data } = await supabase
    .from("contributors")
    .select("id, name")
    .in("id", uniqueIds);

  const nameById = new Map<string, string>();
  for (const row of data ?? []) {
    const id = String((row as { id?: string }).id ?? "").trim();
    const name = String((row as { name?: string | null }).name ?? "").trim();
    if (id && name) nameById.set(id, name);
  }

  return uniqueIds
    .map((id) => nameById.get(id) ?? "")
    .filter(Boolean);
}

export function formatAccessRequestPendingTooltip(
  requesterNames: string[],
): { label: string; supportingText?: string } {
  if (requesterNames.length === 0) {
    return { label: "Access requested" };
  }
  return {
    label: requesterNames.map((name) => `${name} requested access`).join("\n"),
  };
}

export async function loadProjectPendingAccessRequestSummary(
  supabase: SupabaseClient,
  projectId: string,
): Promise<PendingAccessRequestSummary> {
  const { data, error } = await supabase
    .from("access_requests")
    .select("requested_by")
    .eq("project_id", projectId)
    .is("review_id", null)
    .eq("status", "pending");

  if (error || !data?.length) {
    return { count: 0, requesterNames: [] };
  }

  const contributorIds = data.map((row) =>
    String((row as { requested_by?: string | null }).requested_by ?? ""),
  );
  const requesterNames = await resolveContributorNames(supabase, contributorIds);

  return { count: data.length, requesterNames };
}

export async function loadReviewPendingAccessRequestSummary(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<PendingAccessRequestSummary> {
  const { data, error } = await supabase
    .from("access_requests")
    .select("requested_by")
    .eq("review_id", reviewId)
    .is("project_id", null)
    .eq("status", "pending");

  if (error || !data?.length) {
    return { count: 0, requesterNames: [] };
  }

  const contributorIds = data.map((row) =>
    String((row as { requested_by?: string | null }).requested_by ?? ""),
  );
  const requesterNames = await resolveContributorNames(supabase, contributorIds);

  return { count: data.length, requesterNames };
}
