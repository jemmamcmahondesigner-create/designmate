import type { SupabaseClient } from "@supabase/supabase-js";
import { getDecisionRecordedEmailHtml } from "@/lib/emails/decision-recorded-email";
import { getFeedbackSubmittedEmailHtml } from "@/lib/emails/feedback-submitted-email";
import { sendResendEmail } from "@/lib/emails/send-resend-email";
import { getAppOrigin } from "@/lib/workspace/invite-server";

const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function isReminderRateLimited(lastReminderSentAt: string | null): boolean {
  if (!lastReminderSentAt) return false;
  const sentAt = new Date(lastReminderSentAt).getTime();
  if (Number.isNaN(sentAt)) return false;
  return Date.now() - sentAt < REMINDER_COOLDOWN_MS;
}

async function fetchContributorEmailAndName(
  supabase: SupabaseClient,
  contributorId: string,
): Promise<{ email: string; name: string } | null> {
  const { data } = await supabase
    .from("contributors")
    .select("email, name")
    .eq("id", contributorId)
    .maybeSingle();
  if (!data) return null;
  const row = data as { email: string | null; name: string | null };
  const email = row.email?.trim();
  if (!email) return null;
  const name = row.name?.trim() || email.split("@")[0] || "there";
  return { email, name };
}

export async function notifyCreatorFeedbackSubmitted(
  supabase: SupabaseClient,
  input: {
    reviewId: string;
    reviewerId: string;
    reviewerName: string;
    feedbackText: string | null;
  },
): Promise<void> {
  try {
    const { data: review } = await supabase
      .from("reviews")
      .select("title, review_focus, creator_id")
      .eq("id", input.reviewId)
      .maybeSingle();
    if (!review) return;

    const reviewRow = review as {
      title?: string | null;
      review_focus?: string | null;
      creator_id?: string | null;
    };
    const creatorId = String(reviewRow.creator_id ?? "").trim();
    if (!creatorId || creatorId === input.reviewerId) return;

    const creator = await fetchContributorEmailAndName(supabase, creatorId);
    if (!creator) return;

    const { data: changeRows } = await supabase
      .from("change_requests")
      .select("changes_needed")
      .eq("review_id", input.reviewId)
      .eq("reviewer_id", input.reviewerId);

    const changeRequests = (changeRows ?? [])
      .map((row) => {
        const body = String((row as { changes_needed?: string | null }).changes_needed ?? "").trim();
        return body ? { body } : null;
      })
      .filter((item): item is { body: string } => item !== null);

    const reviewTitle = String(reviewRow.title ?? "Review").trim() || "Review";
    const reviewUrl = `${getAppOrigin()}/reviews/${input.reviewId}`;
    const html = getFeedbackSubmittedEmailHtml({
      creatorName: creator.name,
      reviewerName: input.reviewerName,
      reviewTitle,
      reviewFocus: reviewRow.review_focus ?? null,
      feedbackText: input.feedbackText,
      changeRequests,
      reviewUrl,
    });

    await sendResendEmail({
      to: creator.email,
      subject: `${input.reviewerName} left feedback on ${reviewTitle}`,
      html,
    });
  } catch (err) {
    console.error("[notifyCreatorFeedbackSubmitted]", err);
  }
}

export async function notifyCreatorDecisionRecorded(
  supabase: SupabaseClient,
  input: {
    reviewId: string;
    decisionStatus: "approved" | "changes-needed";
    decisionText: string | null;
    tradeOffNote: string | null;
    decisionOwnerId: string | null;
  },
): Promise<void> {
  try {
    const { data: review } = await supabase
      .from("reviews")
      .select(
        "title, review_focus, creator_id, decision_owner_id, decision_status, decision_comments, decision_trade_off_note",
      )
      .eq("id", input.reviewId)
      .maybeSingle();
    if (!review) return;

    const reviewRow = review as {
      title?: string | null;
      review_focus?: string | null;
      creator_id?: string | null;
      decision_owner_id?: string | null;
      decision_status?: string | null;
      decision_comments?: string | null;
      decision_trade_off_note?: string | null;
    };

    const creatorId = String(reviewRow.creator_id ?? "").trim();
    const decisionOwnerId = String(
      input.decisionOwnerId ?? reviewRow.decision_owner_id ?? "",
    ).trim();
    if (!creatorId || (decisionOwnerId && creatorId === decisionOwnerId)) return;

    const creator = await fetchContributorEmailAndName(supabase, creatorId);
    if (!creator) return;

    let decisionMakerName = "A teammate";
    if (decisionOwnerId) {
      const maker = await fetchContributorEmailAndName(supabase, decisionOwnerId);
      if (maker) decisionMakerName = maker.name;
    }

    const reviewTitle = String(reviewRow.title ?? "Review").trim() || "Review";
    const status =
      input.decisionStatus === "changes-needed" ? "changes-needed" : "approved";
    const reviewUrl = `${getAppOrigin()}/reviews/${input.reviewId}`;
    const html = getDecisionRecordedEmailHtml({
      creatorName: creator.name,
      decisionMakerName,
      reviewTitle,
      decisionStatus: status,
      decisionText:
        input.decisionText ??
        (reviewRow.decision_comments?.trim() || null),
      tradeOffNote:
        input.tradeOffNote ??
        (reviewRow.decision_trade_off_note?.trim() || null),
      reviewUrl,
    });

    const subject =
      status === "approved"
        ? `Direction approved — ${reviewTitle}`
        : `Changes requested — ${reviewTitle}`;

    await sendResendEmail({
      to: creator.email,
      subject,
      html,
    });
  } catch (err) {
    console.error("[notifyCreatorDecisionRecorded]", err);
  }
}
