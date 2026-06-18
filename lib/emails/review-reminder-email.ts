import { getDesignTraceWordmarkHtml } from "@/lib/emails/brand-wordmark";

export type ReviewReminderEmailProps = {
  reviewerName: string;
  reviewTitle: string;
  reviewFocus: string;
  reviewUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getReviewReminderEmailHtml({
  reviewerName,
  reviewTitle,
  reviewFocus,
  reviewUrl,
}: ReviewReminderEmailProps): string {
  const safeReviewer = escapeHtml(reviewerName);
  const safeTitle = escapeHtml(reviewTitle);
  const safeUrl = escapeHtml(reviewUrl);
  const focusTrimmed = reviewFocus.trim();
  const focusBlock =
    focusTrimmed.length > 0
      ? `
              <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#998c82;letter-spacing:0.5px;text-transform:uppercase;">
                REVIEW FOCUS
              </p>
              <p style="margin:0 0 24px;font-size:14px;font-weight:400;color:#2e1c1c;line-height:1.5;background:#f3efe9;border-radius:6px;padding:12px;">
                ${escapeHtml(focusTrimmed)}
              </p>`
      : `<div style="margin-bottom:24px;"></div>`;

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
                You have a review waiting for your feedback
              </h2>
              <p style="margin:0 0 24px;font-size:15px;font-weight:400;color:#6b5e55;line-height:1.5;">
                Hi ${safeReviewer}, ${safeTitle} is ready for your input.
              </p>
              ${focusBlock}
              <a href="${safeUrl}" style="display:inline-block;background:#ffe96c;color:#2a221b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;border:none;">
                View Review &amp; Give Feedback
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 32px;border-top:1px solid #ede8e0;">
              <p style="margin:0;font-size:12px;color:#c9c0b4;text-align:center;">
                You're receiving this because you were added as a reviewer on DesignTrace.
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
