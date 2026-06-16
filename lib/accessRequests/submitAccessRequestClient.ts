import type { SupabaseClient } from "@supabase/supabase-js";
import { logTimelineEventClient } from "@/lib/timeline/logEventClient";
import { resolveAccessRequestRecipient } from "@/lib/workspace/resolveAccessRequestRecipient";

export type SubmitAccessRequestInput = {
  supabase: SupabaseClient;
  projectId: string;
  workspaceId: string;
  requestedByContributorId: string;
  /** When set, request is for review access; timeline still uses parent projectId. */
  reviewId?: string | null;
};

export type SubmitAccessRequestResult =
  | { success: true; recipientName: string | null }
  | { success: false; error: string };

export async function submitAccessRequestClient(
  input: SubmitAccessRequestInput,
): Promise<SubmitAccessRequestResult> {
  const {
    supabase,
    projectId,
    workspaceId,
    requestedByContributorId,
    reviewId = null,
  } = input;

  const recipient = await resolveAccessRequestRecipient(
    supabase,
    projectId,
    workspaceId,
  );

  const insertRow = reviewId
    ? {
        project_id: null,
        review_id: reviewId,
        requested_by: requestedByContributorId,
        requested_to: recipient.contributorId,
        status: "pending" as const,
      }
    : {
        project_id: projectId,
        review_id: null,
        requested_by: requestedByContributorId,
        requested_to: recipient.contributorId,
        status: "pending" as const,
      };

  const { error: insertError } = await supabase
    .from("access_requests")
    .insert(insertRow);

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  await logTimelineEventClient({
    projectId,
    reviewId: reviewId ?? null,
    actorId: requestedByContributorId,
    eventType: "access_requested",
    payload: {
      requested_to_name: recipient.name ?? undefined,
      target: reviewId ? "review" : "project",
    },
  });

  return { success: true, recipientName: recipient.name };
}
