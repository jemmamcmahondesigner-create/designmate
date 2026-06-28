import { NextResponse } from "next/server";
import { DESIGN_TRACE_RESEND_FROM } from "@/lib/emails/invite-email";
import { getReviewReminderEmailHtml } from "@/lib/emails/review-reminder-email";
import { assertCanSendReviewReminder } from "@/lib/reviews/assertCanSendReviewReminder";
import { logReviewersNotifiedEvent } from "@/lib/reviews/reviewersNotifiedActivity";
import { isReminderRateLimited } from "@/lib/reviews/notify-review-creator";
import { getEffectiveCurrentContributor } from "@/lib/auth/effectiveContributor";
import { getAppOrigin } from "@/lib/workspace/invite-server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: { params: { reviewId: string } },
) {
  const reviewId = context.params.reviewId?.trim();
  if (!reviewId) {
    return NextResponse.json({ error: "Review id is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const adminSupabase = createServiceClient();

  const { data: review, error: reviewError } = await adminSupabase
    .from("reviews")
    .select("id, title, review_focus, project_id, last_reminder_sent_at")
    .eq("id", reviewId)
    .maybeSingle();

  if (reviewError || !review) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  const reviewRow = review as {
    project_id?: string;
    title?: string;
    review_focus?: string | null;
    last_reminder_sent_at?: string | null;
  };
  const existingLastSent = reviewRow.last_reminder_sent_at ?? null;

  if (isReminderRateLimited(existingLastSent)) {
    return NextResponse.json(
      { error: "rate_limited", last_sent_at: existingLastSent },
      { status: 429 },
    );
  }

  const projectId = String(reviewRow.project_id ?? "").trim();
  const access = await assertCanSendReviewReminder(
    adminSupabase,
    reviewId,
    projectId,
    supabase,
  );
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: feedbackRows, error: feedbackError } = await adminSupabase
    .from("reviewer_feedback")
    .select("reviewer_id, feedback_submitted_at, feedback_status")
    .eq("review_id", reviewId);

  if (feedbackError) {
    return NextResponse.json({ error: feedbackError.message }, { status: 500 });
  }

  const pendingReviewerIds = (feedbackRows ?? [])
    .filter((row) => {
      const record = row as {
        feedback_submitted_at?: string | null;
        feedback_status?: string | null;
      };
      if (record.feedback_submitted_at != null) return false;
      const status = String(record.feedback_status ?? "")
        .trim()
        .toLowerCase();
      return status !== "submitted";
    })
    .map((row) => String((row as { reviewer_id: string }).reviewer_id).trim())
    .filter(Boolean);

  if (pendingReviewerIds.length === 0) {
    return NextResponse.json({
      sent: 0,
      recipients: [],
      last_reminder_sent_at: existingLastSent,
    });
  }

  const { data: projectRow } = await adminSupabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .maybeSingle();
  const workspaceId = String(
    (projectRow as { workspace_id?: string | null } | null)?.workspace_id ?? "",
  ).trim();

  let contributorsQuery = adminSupabase
    .from("contributors")
    .select("id, email, name")
    .in("id", pendingReviewerIds);
  if (workspaceId) {
    contributorsQuery = contributorsQuery.eq("workspace_id", workspaceId);
  }
  const { data: contributors, error: contributorsError } = await contributorsQuery;

  if (contributorsError) {
    return NextResponse.json({ error: contributorsError.message }, { status: 500 });
  }

  const reviewTitle = String(reviewRow.title ?? "Review").trim() || "Review";
  const reviewFocus = String(reviewRow.review_focus ?? "");
  const reviewUrl = `${getAppOrigin()}/reviews/${reviewId}`;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[review-remind] RESEND_API_KEY is not set; skipping email send.");
    return NextResponse.json(
      { error: "Email service is not configured." },
      { status: 500 },
    );
  }

  const from = process.env.RESEND_FROM?.trim() || DESIGN_TRACE_RESEND_FROM;
  const subject = `Reminder: your feedback is needed on ${reviewTitle}`;
  const recipients: string[] = [];

  for (const contributor of contributors ?? []) {
    const row = contributor as { id: string; email: string | null; name: string | null };
    const email = row.email?.trim();
    if (!email) continue;

    if (recipients.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const reviewerName =
      row.name?.trim() || email.split("@")[0] || "there";
    const html = getReviewReminderEmailHtml({
      reviewerName,
      reviewTitle,
      reviewFocus,
      reviewUrl,
    });

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject,
          html,
        }),
      });

      if (response.status === 429) {
        console.error("[review-remind] Resend rate limit (429)");
        return NextResponse.json(
          { error: "Too many requests. Please wait a moment and try again." },
          { status: 429 },
        );
      }

      if (!response.ok) {
        const body = await response.text();
        console.error("[review-remind] Resend API error:", response.status, body);
        return NextResponse.json(
          { error: "Failed to send reminder email." },
          { status: 500 },
        );
      }

      recipients.push(email);
    } catch (err) {
      console.error("[review-remind] Resend send failed:", err);
      return NextResponse.json(
        { error: "Failed to send reminder email." },
        { status: 500 },
      );
    }
  }

  if (pendingReviewerIds.length > 0 && recipients.length === 0) {
    return NextResponse.json(
      { error: "Failed to send reminder email." },
      { status: 500 },
    );
  }

  let lastReminderSentAt = existingLastSent;
  if (recipients.length > 0) {
    const sentAt = new Date().toISOString();
    const { error: updateError } = await adminSupabase
      .from("reviews")
      .update({ last_reminder_sent_at: sentAt })
      .eq("id", reviewId);
    if (updateError) {
      console.error("[review-remind] failed to update last_reminder_sent_at:", updateError);
    } else {
      lastReminderSentAt = sentAt;
    }

    const actorContributor = await getEffectiveCurrentContributor(supabase, projectId);
    const activityResult = await logReviewersNotifiedEvent(supabase, {
      projectId,
      reviewId,
      actorId: access.contributorId,
      actorName: actorContributor?.name?.trim() || "A team member",
      trigger: "reminder",
      recipientIds: pendingReviewerIds,
    });
    if (!activityResult.ok) {
      console.error(
        "[review-remind] reviewers_notified activity failed:",
        activityResult.error,
      );
    }
  }

  return NextResponse.json({
    sent: recipients.length,
    recipients,
    last_reminder_sent_at: lastReminderSentAt,
  });
}
