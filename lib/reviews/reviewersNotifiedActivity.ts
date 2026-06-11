import type { SupabaseClient } from "@supabase/supabase-js";

export type ReviewersNotifiedTrigger =
  | "publish"
  | "reviewer_added"
  | "reminder"
  | "reopen";

export async function resolveReviewersNotifiedRecipients(
  supabase: SupabaseClient,
  reviewId: string,
  recipientIdsOverride?: string[],
): Promise<{ recipientIds: string[]; recipientNames: string[] }> {
  let recipientIds = (recipientIdsOverride ?? [])
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);

  if (recipientIds.length === 0) {
    const { data: feedbackRows, error: feedbackError } = await supabase
      .from("reviewer_feedback")
      .select("reviewer_id")
      .eq("review_id", reviewId);

    if (feedbackError) {
      throw new Error(feedbackError.message);
    }

    recipientIds = [
      ...new Set(
        (feedbackRows ?? [])
          .map((row) =>
            String((row as { reviewer_id?: string | null }).reviewer_id ?? "").trim(),
          )
          .filter(Boolean),
      ),
    ];
  }

  if (recipientIds.length === 0) {
    return { recipientIds: [], recipientNames: [] };
  }

  const { data: contributors, error: contributorsError } = await supabase
    .from("contributors")
    .select("id, name")
    .in("id", recipientIds);

  if (contributorsError) {
    throw new Error(contributorsError.message);
  }

  const contributorById = new Map(
    (contributors ?? []).map((c) => {
      const contributor = c as { id?: string; name?: string | null };
      return [String(contributor.id ?? "").trim(), contributor] as const;
    }),
  );

  const recipientNames = recipientIds.map((reviewerId) => {
    const name = contributorById.get(reviewerId)?.name?.trim();
    return name || "Reviewer";
  });

  return { recipientIds, recipientNames };
}

export async function logReviewersNotifiedEvent(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    reviewId: string;
    actorId?: string | null;
    actorName: string;
    trigger: ReviewersNotifiedTrigger;
    recipientIds?: string[];
  },
): Promise<{ ok: boolean; error?: string }> {
  const projectId = input.projectId.trim();
  const reviewId = input.reviewId.trim();
  if (!projectId || !reviewId) {
    return { ok: false, error: "Missing project or review id." };
  }

  try {
    const { recipientIds, recipientNames } = await resolveReviewersNotifiedRecipients(
      supabase,
      reviewId,
      input.recipientIds,
    );

    if (recipientIds.length === 0) {
      return { ok: false, error: "No reviewer recipients found." };
    }

    const { error: insertError } = await supabase.from("timeline_events").insert({
      project_id: projectId,
      review_id: reviewId,
      actor_id: input.actorId?.trim() || null,
      event_type: "reviewers_notified",
      payload: {
        actor_name: input.actorName.trim() || "A team member",
        trigger: input.trigger,
        recipient_ids: recipientIds,
        recipient_names: recipientNames,
        recipient_count: recipientIds.length,
      },
    });

    if (insertError) {
      console.error("[logReviewersNotifiedEvent] insert failed:", insertError.message);
      return { ok: false, error: insertError.message };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[logReviewersNotifiedEvent] failed:", message);
    return { ok: false, error: message };
  }
}
