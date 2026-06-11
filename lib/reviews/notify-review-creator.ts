import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "@/lib/emails/escape-html";
import { getDesignTraceWordmarkHtml } from "@/lib/emails/brand-wordmark";
import { getChangeRequestEmailHtml } from "@/lib/emails/change-request-email";
import { getDecisionRecordedEmailHtml } from "@/lib/emails/decision-recorded-email";
import { getFeedbackSubmittedEmailHtml } from "@/lib/emails/feedback-submitted-email";
import { sendResendEmail } from "@/lib/emails/send-resend-email";
import { getAppOrigin } from "@/lib/workspace/invite-server";

const REMINDER_COOLDOWN_MS = 60 * 60 * 1000;
const CHANGE_REQUEST_EMAIL_COOLDOWN_MS = 10 * 60 * 1000;

export function isReminderRateLimited(lastReminderSentAt: string | null): boolean {
  if (!lastReminderSentAt) return false;
  const sentAt = new Date(lastReminderSentAt).getTime();
  if (Number.isNaN(sentAt)) return false;
  return Date.now() - sentAt < REMINDER_COOLDOWN_MS;
}

function isChangeRequestEmailRateLimited(lastSentAt: string | null): boolean {
  if (!lastSentAt) return false;
  const sentAt = new Date(lastSentAt).getTime();
  if (Number.isNaN(sentAt)) return false;
  return Date.now() - sentAt < CHANGE_REQUEST_EMAIL_COOLDOWN_MS;
}

function parseReviewArtifacts(raw: unknown): Array<{ id: string; label: string; title?: string | null }> {
  const items = Array.isArray(raw) ? raw : [];
  return items.map((item, index) => {
    if (!item || typeof item !== "object") {
      return { id: `artifact-${index}`, label: "Untitled", title: null };
    }
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? `artifact-${index}`);
    const title = row.title == null ? null : String(row.title);
    const originalFileName =
      row.originalFileName == null ? null : String(row.originalFileName);
    const label = String(title ?? row.label ?? originalFileName ?? id).trim() || id;
    return { id, label, title };
  });
}

function labelForArtifactKey(
  key: string,
  artifacts: Array<{ id: string; label: string; title?: string | null }>,
): string {
  const match = artifacts.find((artifact) => {
    const title = String(artifact.title ?? "").trim();
    return key === artifact.id || (title && key === title);
  });
  return match?.label ?? key;
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

/** reviews.creator_id → auth.users(id); legacy rows may still store contributors.id. */
async function fetchReviewCreatorEmailAndName(
  supabase: SupabaseClient,
  creatorId: string,
): Promise<{ email: string; name: string } | null> {
  const byContributorId = await fetchContributorEmailAndName(supabase, creatorId);
  if (byContributorId) return byContributorId;

  const { data } = await supabase
    .from("contributors")
    .select("email, name")
    .eq("user_id", creatorId)
    .limit(1)
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

    const creator = await fetchReviewCreatorEmailAndName(supabase, creatorId);
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

export async function notifyReviewerFeedbackSubmittedOnBehalf(
  supabase: SupabaseClient,
  input: {
    reviewId: string;
    reviewerId: string;
    reviewerName: string;
    submittedByName: string;
  },
): Promise<void> {
  try {
    const reviewer = await fetchContributorEmailAndName(supabase, input.reviewerId);
    if (!reviewer) return;

    const { data: review } = await supabase
      .from("reviews")
      .select("title, review_focus")
      .eq("id", input.reviewId)
      .maybeSingle();
    if (!review) return;

    const reviewRow = review as {
      title?: string | null;
      review_focus?: string | null;
    };
    const reviewTitle = String(reviewRow.title ?? "Review").trim() || "Review";
    const reviewUrl = `${getAppOrigin()}/reviews/${input.reviewId}`;
    const safeReviewer = escapeHtml(input.reviewerName || reviewer.name);
    const safeSubmitter = escapeHtml(input.submittedByName || "A teammate");
    const safeTitle = escapeHtml(reviewTitle);
    const safeUrl = escapeHtml(reviewUrl);
    const focusText = String(reviewRow.review_focus ?? "").trim();
    const focusBlock = focusText
      ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#998c82;letter-spacing:0.5px;text-transform:uppercase;">REVIEW FOCUS</p>
         <p style="margin:0 0 24px;font-size:14px;font-weight:400;color:#2e1c1c;line-height:1.5;background:#f3efe9;border-radius:6px;padding:12px;">${escapeHtml(focusText)}</p>`
      : "";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;border:1px solid #ede8e0;max-width:560px;">
          <tr>
            <td style="padding:32px 40px 24px;">
              <p style="margin:0 0 20px;font-size:20px;line-height:1.2;">${getDesignTraceWordmarkHtml()}</p>
              <hr style="border:none;border-top:1px solid #ede8e0;margin:0 0 24px;"/>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#6b1e2e;line-height:1.3;">
                ${safeSubmitter} submitted feedback on your behalf
              </h2>
              <p style="margin:0 0 24px;font-size:15px;font-weight:400;color:#6b5e55;line-height:1.5;">
                Hi ${safeReviewer}, your feedback on ${safeTitle} was submitted by ${safeSubmitter}.
              </p>
              ${focusBlock}
              <a href="${safeUrl}" style="display:inline-block;background:#ffe96c;color:#2a221b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;border:none;">
                View Review
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 32px;border-top:1px solid #ede8e0;">
              <p style="margin:0;font-size:12px;color:#c9c0b4;text-align:center;">
                You're receiving this because feedback was submitted on your behalf in DesignTrace.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await sendResendEmail({
      to: reviewer.email,
      subject: `${input.submittedByName} submitted feedback for ${reviewTitle}`,
      html,
    });
  } catch (err) {
    console.error("[notifyReviewerFeedbackSubmittedOnBehalf]", err);
  }
}

export async function notifyCreatorChangeRequested(
  supabase: SupabaseClient,
  input: {
    reviewId: string;
    requesterId: string;
    latestChangeRequestId: string;
  },
): Promise<void> {
  try {
    const { data: review } = await supabase
      .from("reviews")
      .select("title, review_focus, creator_id, artifacts, last_change_request_email_sent_at")
      .eq("id", input.reviewId)
      .maybeSingle();
    if (!review) return;

    const reviewRow = review as {
      title?: string | null;
      review_focus?: string | null;
      creator_id?: string | null;
      artifacts?: unknown;
      last_change_request_email_sent_at?: string | null;
    };
    const creatorId = String(reviewRow.creator_id ?? "").trim();
    if (!creatorId || creatorId === input.requesterId) return;

    const lastSentAt = reviewRow.last_change_request_email_sent_at ?? null;
    if (isChangeRequestEmailRateLimited(lastSentAt)) return;

    const creator = await fetchReviewCreatorEmailAndName(supabase, creatorId);
    if (!creator) return;

    let query = supabase
      .from("change_requests")
      .select("id, reviewer_id, artifact_ids, changes_needed, created_at")
      .eq("review_id", input.reviewId)
      .order("created_at", { ascending: true });

    if (lastSentAt) {
      query = query.gt("created_at", lastSentAt);
    } else {
      query = query.eq("id", input.latestChangeRequestId);
    }

    const { data: changeRows } = await query;
    const changes = (changeRows ?? []) as Array<{
      id?: string | null;
      reviewer_id?: string | null;
      artifact_ids?: unknown;
      changes_needed?: string | null;
      created_at?: string | null;
    }>;
    if (changes.length === 0) return;

    const reviewerIds = [...new Set(changes.map((row) => String(row.reviewer_id ?? "").trim()).filter(Boolean))];
    const { data: contributors } = reviewerIds.length
      ? await supabase
          .from("contributors")
          .select("id, name")
          .in("id", reviewerIds)
      : { data: [] };
    const contributorNameById = new Map(
      ((contributors ?? []) as Array<{ id?: string | null; name?: string | null }>).map((row) => [
        String(row.id ?? ""),
        String(row.name ?? "").trim() || "Reviewer",
      ]),
    );
    const artifacts = parseReviewArtifacts(reviewRow.artifacts);
    const html = getChangeRequestEmailHtml({
      creatorName: creator.name,
      reviewTitle: String(reviewRow.title ?? "Review").trim() || "Review",
      reviewFocus: reviewRow.review_focus ?? null,
      reviewUrl: `${getAppOrigin()}/reviews/${input.reviewId}`,
      changes: changes.map((row) => {
        const keys = Array.isArray(row.artifact_ids)
          ? row.artifact_ids.map((value) => String(value).trim()).filter(Boolean)
          : [];
        return {
          reviewerName:
            contributorNameById.get(String(row.reviewer_id ?? "").trim()) ?? "Reviewer",
          artifactName: keys.length > 0 ? labelForArtifactKey(keys[0], artifacts) : null,
          changesNeeded: row.changes_needed ?? null,
        };
      }),
    });

    await sendResendEmail({
      to: creator.email,
      subject: `New change requests on ${String(reviewRow.title ?? "Review").trim() || "Review"}`,
      html,
    });

    await supabase
      .from("reviews")
      .update({ last_change_request_email_sent_at: new Date().toISOString() })
      .eq("id", input.reviewId);
  } catch (err) {
    console.error("[notifyCreatorChangeRequested]", err);
  }
}

/**
 * Compare reviews: once every assigned reviewer (incl. the Decision Maker) has
 * submitted their concept preference, the review transitions to
 * `feedback-submitted` and the Decision Maker is prompted to record the final
 * decision. Email them so they know it's their turn.
 */
export async function notifyDecisionMakerDecisionRequired(
  supabase: SupabaseClient,
  input: {
    reviewId: string;
    decisionOwnerId: string | null;
  },
): Promise<void> {
  try {
    const decisionOwnerId = String(input.decisionOwnerId ?? "").trim();
    if (!decisionOwnerId) return;

    const decisionMaker = await fetchContributorEmailAndName(supabase, decisionOwnerId);
    if (!decisionMaker) return;

    const { data: review } = await supabase
      .from("reviews")
      .select("title, review_focus")
      .eq("id", input.reviewId)
      .maybeSingle();
    if (!review) return;

    const reviewRow = review as { title?: string | null; review_focus?: string | null };
    const reviewTitle = String(reviewRow.title ?? "Review").trim() || "Review";
    const reviewUrl = `${getAppOrigin()}/reviews/${input.reviewId}`;
    const safeName = escapeHtml(decisionMaker.name);
    const safeTitle = escapeHtml(reviewTitle);
    const safeUrl = escapeHtml(reviewUrl);
    const focusText = String(reviewRow.review_focus ?? "").trim();
    const focusBlock = focusText
      ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#998c82;letter-spacing:0.5px;text-transform:uppercase;">REVIEW FOCUS</p>
         <p style="margin:0 0 24px;font-size:14px;font-weight:400;color:#2e1c1c;line-height:1.5;background:#f3efe9;border-radius:6px;padding:12px;">${escapeHtml(focusText)}</p>`
      : "";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;border:1px solid #ede8e0;max-width:560px;">
          <tr>
            <td style="padding:32px 40px 24px;">
              <p style="margin:0 0 20px;font-size:20px;line-height:1.2;">${getDesignTraceWordmarkHtml()}</p>
              <hr style="border:none;border-top:1px solid #ede8e0;margin:0 0 24px;"/>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#6b1e2e;line-height:1.3;">
                A decision is required on ${safeTitle}
              </h2>
              <p style="margin:0 0 24px;font-size:15px;font-weight:400;color:#6b5e55;line-height:1.5;">
                Hi ${safeName}, all reviewers have submitted their feedback. Your final decision is now required.
              </p>
              ${focusBlock}
              <a href="${safeUrl}" style="display:inline-block;background:#ffe96c;color:#2a221b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;border:none;">
                Make Decision
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 32px;border-top:1px solid #ede8e0;">
              <p style="margin:0;font-size:12px;color:#c9c0b4;text-align:center;">
                You're receiving this because you're the decision maker on this review in DesignTrace.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await sendResendEmail({
      to: decisionMaker.email,
      subject: `A decision is required on ${reviewTitle}`,
      html,
    });
  } catch (err) {
    console.error("[notifyDecisionMakerDecisionRequired]", err);
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

    const creator = await fetchReviewCreatorEmailAndName(supabase, creatorId);
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
