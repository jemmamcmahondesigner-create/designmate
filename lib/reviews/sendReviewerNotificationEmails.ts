import type { SupabaseClient } from "@supabase/supabase-js";
import { getReviewCreatedEmailHtml } from "@/lib/emails/review-created-email";
import { sendResendEmail } from "@/lib/emails/send-resend-email";
import { getAppOrigin } from "@/lib/workspace/invite-server";

export async function sendReviewerNotificationEmails(
  supabase: SupabaseClient,
  input: {
    reviewId: string;
    reviewTitle: string;
    creatorName: string;
    reviewerIds: string[];
  },
): Promise<number> {
  const reviewerIds = input.reviewerIds.map((id) => id.trim()).filter(Boolean);
  if (reviewerIds.length === 0) return 0;

  const { data: contributors, error } = await supabase
    .from("contributors")
    .select("id, email")
    .in("id", reviewerIds);

  if (error) {
    console.error("[sendReviewerNotificationEmails] contributors load failed:", error.message);
    return 0;
  }

  const reviewUrl = `${getAppOrigin()}/reviews/${input.reviewId.trim()}`;
  const subject = `${input.reviewTitle.trim() || "Review"} — Your feedback is needed`;
  const html = getReviewCreatedEmailHtml({
    creatorName: input.creatorName.trim() || "A teammate",
    reviewTitle: input.reviewTitle.trim() || "Review",
    reviewUrl,
  });

  const uniqueEmails = [
    ...new Set(
      (contributors ?? [])
        .map((c) => String((c as { email?: string | null }).email ?? "").trim())
        .filter(Boolean),
    ),
  ];

  const results = await Promise.all(
    uniqueEmails.map((to) =>
      sendResendEmail({ to, subject, html }).then(
        () => true,
        (err) => {
          console.error("[sendReviewerNotificationEmails] send failed:", to, err);
          return false;
        },
      ),
    ),
  );

  return results.filter(Boolean).length;
}
