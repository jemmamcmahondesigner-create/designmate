import { escapeHtml } from "@/lib/emails/escape-html";
import { getDesignTraceWordmarkHtml } from "@/lib/emails/brand-wordmark";

export type FeedbackSubmittedEmailProps = {
  creatorName: string;
  reviewerName: string;
  reviewTitle: string;
  reviewFocus: string | null;
  feedbackText: string | null;
  changeRequests: Array<{ body: string }>;
  reviewUrl: string;
};

function emailTextBlock(label: string, text: string, variant: "default" | "change" = "default") {
  const safe = escapeHtml(text);
  if (variant === "change") {
    return `
              <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#998c82;letter-spacing:0.5px;text-transform:uppercase;">
                ${label}
              </p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:400;color:#2e1c1c;line-height:1.5;background:#fef8dc;border-left:3px solid #e5b025;border-radius:6px;padding:12px;">
                ${safe}
              </p>`;
  }
  return `
              <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#998c82;letter-spacing:0.5px;text-transform:uppercase;">
                ${label}
              </p>
              <p style="margin:0 0 24px;font-size:14px;font-weight:400;color:#2e1c1c;line-height:1.5;background:#f3efe9;border-radius:6px;padding:12px;">
                ${safe}
              </p>`;
}

export function getFeedbackSubmittedEmailHtml({
  creatorName,
  reviewerName,
  reviewTitle,
  reviewFocus,
  feedbackText,
  changeRequests,
  reviewUrl,
}: FeedbackSubmittedEmailProps): string {
  const safeCreator = escapeHtml(creatorName);
  const safeReviewer = escapeHtml(reviewerName);
  const safeTitle = escapeHtml(reviewTitle);
  const safeUrl = escapeHtml(reviewUrl);

  const focusTrimmed = (reviewFocus ?? "").trim();
  const focusBlock =
    focusTrimmed.length > 0 ? emailTextBlock("REVIEW FOCUS", focusTrimmed) : "";

  const feedbackTrimmed = (feedbackText ?? "").trim();
  const feedbackBlock =
    feedbackTrimmed.length > 0 ? emailTextBlock("FEEDBACK", feedbackTrimmed) : "";

  const changeBlocks =
    changeRequests.length > 0
      ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#998c82;letter-spacing:0.5px;text-transform:uppercase;">
                CHANGE REQUESTS
              </p>${changeRequests
                .map((cr) => emailTextBlock("", (cr.body ?? "").trim(), "change"))
                .join("")}`
      : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;border:1px solid #ede8e0;max-width:560px;">
          <tr>
            <td style="padding:32px 40px 24px;">
              ${getDesignTraceWordmarkHtml()}
              <hr style="border:none;border-top:1px solid #ede8e0;margin:0 0 24px;"/>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#6b1e2e;line-height:1.3;">
                ${safeReviewer} has submitted feedback on ${safeTitle}
              </h2>
              <p style="margin:0 0 24px;font-size:15px;font-weight:400;color:#6b5e55;line-height:1.5;">
                Hi ${safeCreator}, here's a summary of their input.
              </p>
              ${focusBlock}
              ${feedbackBlock}
              ${changeBlocks}
              <a href="${safeUrl}" style="display:inline-block;background:#ffe96c;color:#2a221b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;border:none;">
                View Feedback on DesignTrace
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 32px;border-top:1px solid #ede8e0;">
              <p style="margin:0;font-size:12px;color:#c9c0b4;text-align:center;">
                You're receiving this as the review creator on DesignTrace.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
