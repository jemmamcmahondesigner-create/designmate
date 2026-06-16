import type { SupabaseClient } from "@supabase/supabase-js";
import { readDevImpersonationContributorIdFromBrowser } from "@/lib/auth/resolveEffectiveContributor";

export type PendingAccessRequestState = {
  recipientName: string | null;
  createdAt: string | null;
} | null;

async function contributorNameForId(
  supabase: SupabaseClient,
  contributorId: string | null,
): Promise<string | null> {
  const id = contributorId?.trim();
  if (!id) return null;
  const { data } = await supabase
    .from("contributors")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const name = String((data as { name?: string | null } | null)?.name ?? "").trim();
  return name || null;
}

export async function resolveRequesterContributorId(
  supabase: SupabaseClient,
  workspaceId: string,
  impersonatedContributorId: string | null,
): Promise<string | null> {
  const trimmed = impersonatedContributorId?.trim() || null;
  if (trimmed) {
    const { data } = await supabase
      .from("contributors")
      .select("id")
      .eq("id", trimmed)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const id = String((data as { id?: string } | null)?.id ?? "").trim();
    return id || trimmed;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id?.trim();
  if (!userId) return null;

  const { data } = await supabase
    .from("contributors")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return String((data as { id?: string } | null)?.id ?? "").trim() || null;
}

/** Server: pending access request for the effective workspace contributor. */
export async function loadPendingAccessRequestServer(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    requestedByContributorId: string | null;
    projectId?: string | null;
    reviewId?: string | null;
  },
): Promise<PendingAccessRequestState> {
  const requesterId = input.requestedByContributorId?.trim();
  if (!requesterId) return null;

  let query = supabase
    .from("access_requests")
    .select("id, requested_to, created_at")
    .eq("requested_by", requesterId)
    .eq("status", "pending");

  if (input.reviewId) {
    query = query.eq("review_id", input.reviewId).is("project_id", null);
  } else if (input.projectId) {
    query = query.eq("project_id", input.projectId).is("review_id", null);
  } else {
    return null;
  }

  const { data } = await query.maybeSingle();
  if (!data) return null;

  const requestedTo = String(
    (data as { requested_to?: string | null }).requested_to ?? "",
  ).trim();
  const recipientName = await contributorNameForId(supabase, requestedTo || null);
  const createdAt = String(
    (data as { created_at?: string | null }).created_at ?? "",
  ).trim();

  return { recipientName, createdAt: createdAt || null };
}

/** Client: resolve requester id then load pending row. */
export async function loadPendingAccessRequestClient(
  supabase: SupabaseClient,
  input: {
    workspaceId: string;
    projectId?: string | null;
    reviewId?: string | null;
  },
): Promise<{ requesterContributorId: string | null; pending: PendingAccessRequestState }> {
  const impersonatedId = readDevImpersonationContributorIdFromBrowser();
  const requesterContributorId = await resolveRequesterContributorId(
    supabase,
    input.workspaceId,
    impersonatedId,
  );

  if (!requesterContributorId) {
    return { requesterContributorId: null, pending: null };
  }

  let query = supabase
    .from("access_requests")
    .select("id, requested_to, created_at")
    .eq("requested_by", requesterContributorId)
    .eq("status", "pending");

  if (input.reviewId) {
    query = query.eq("review_id", input.reviewId).is("project_id", null);
  } else if (input.projectId) {
    query = query.eq("project_id", input.projectId).is("review_id", null);
  } else {
    return { requesterContributorId, pending: null };
  }

  const { data } = await query.maybeSingle();
  if (!data) {
    return { requesterContributorId, pending: null };
  }

  const requestedTo = String(
    (data as { requested_to?: string | null }).requested_to ?? "",
  ).trim();
  const recipientName = await contributorNameForId(supabase, requestedTo || null);
  const createdAt = String(
    (data as { created_at?: string | null }).created_at ?? "",
  ).trim();

  return {
    requesterContributorId,
    pending: { recipientName, createdAt: createdAt || null },
  };
}
