import type { SupabaseClient } from "@supabase/supabase-js";

async function expandContributorIdentityIds(
  supabase: SupabaseClient,
  contributorIds: string[],
): Promise<string[]> {
  const seedIds = [...new Set(contributorIds.map((id) => id.trim()).filter(Boolean))];
  if (seedIds.length === 0) return [];

  const { data: seedRows } = await supabase
    .from("contributors")
    .select("id, user_id, email")
    .in("id", seedIds);

  const expanded = new Set<string>(seedIds);
  const userIds = new Set<string>();
  const emails = new Set<string>();

  for (const row of seedRows ?? []) {
    const userId = String((row as { user_id?: string | null }).user_id ?? "").trim();
    const email = String((row as { email?: string | null }).email ?? "")
      .trim()
      .toLowerCase();
    if (userId) userIds.add(userId);
    if (email) emails.add(email);
  }

  if (userIds.size > 0) {
    const { data: byUser } = await supabase
      .from("contributors")
      .select("id")
      .in("user_id", [...userIds]);
    for (const row of byUser ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      if (id) expanded.add(id);
    }
  }

  for (const email of emails) {
    const { data: byEmail } = await supabase
      .from("contributors")
      .select("id")
      .ilike("email", email);
    for (const row of byEmail ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      if (id) expanded.add(id);
    }
  }

  return [...expanded];
}

/** Marks pending access requests as approved when access is granted by adding a reviewer/teammate. */
export async function approvePendingAccessRequestsServer(
  supabase: SupabaseClient,
  input: {
    contributorIds: string[];
    projectId?: string | null;
    reviewId?: string | null;
  },
): Promise<void> {
  const projectId = input.projectId?.trim() || null;
  const reviewId = input.reviewId?.trim() || null;
  if (!projectId && !reviewId) return;

  const requesterIds = await expandContributorIdentityIds(
    supabase,
    input.contributorIds,
  );
  if (requesterIds.length === 0) return;

  const resolvedAt = new Date().toISOString();
  let query = supabase
    .from("access_requests")
    .update({ status: "approved", resolved_at: resolvedAt })
    .eq("status", "pending")
    .in("requested_by", requesterIds);

  if (reviewId) {
    query = query.eq("review_id", reviewId).is("project_id", null);
  } else if (projectId) {
    query = query.eq("project_id", projectId).is("review_id", null);
  }

  await query;
}

export async function approvePendingAccessRequestsClient(
  supabase: SupabaseClient,
  input: {
    contributorIds: string[];
    projectId?: string | null;
    reviewId?: string | null;
  },
): Promise<void> {
  await approvePendingAccessRequestsServer(supabase, input);
}
