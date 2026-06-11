import type { SupabaseClient } from "@supabase/supabase-js";
import { sendReviewerNotificationEmails } from "@/lib/reviews/sendReviewerNotificationEmails";
import { resolveReviewersNotifiedRecipients } from "@/lib/reviews/reviewersNotifiedActivity";

type ReviewRow = {
  id: string;
  title?: string | null;
  send_notification?: boolean | null;
  owner_display_name?: string | null;
};

export async function sendReviewCreatedNotifications(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<{ sent: number; skipped: boolean }> {
  const id = reviewId.trim();
  if (!id) return { sent: 0, skipped: true };

  const { data: review, error } = await supabase
    .from("reviews")
    .select("id, title, send_notification, owner_display_name")
    .eq("id", id)
    .maybeSingle();

  if (error || !review) {
    console.error("[sendReviewCreatedNotifications] review load failed:", error?.message);
    return { sent: 0, skipped: true };
  }

  const row = review as ReviewRow;
  if (!row.send_notification) {
    return { sent: 0, skipped: true };
  }

  let recipientIds: string[] = [];
  try {
    ({ recipientIds } = await resolveReviewersNotifiedRecipients(supabase, id));
  } catch (err) {
    console.error("[sendReviewCreatedNotifications] recipients resolve failed:", err);
    return { sent: 0, skipped: false };
  }

  if (recipientIds.length === 0) {
    return { sent: 0, skipped: false };
  }

  const reviewTitle = String(row.title ?? "Review").trim() || "Review";
  const creatorName = String(row.owner_display_name ?? "").trim() || "A teammate";

  const sent = await sendReviewerNotificationEmails(supabase, {
    reviewId: id,
    reviewTitle,
    creatorName,
    reviewerIds: recipientIds,
  });

  return { sent, skipped: false };
}
