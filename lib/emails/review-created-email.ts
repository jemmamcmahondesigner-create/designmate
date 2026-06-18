import { escapeHtml } from "@/lib/emails/escape-html";
import { getDesignTraceWordmarkHtml } from "@/lib/emails/brand-wordmark";

export type ReviewCreatedEmailProps = {
  creatorName: string;
  reviewTitle: string;
  reviewUrl: string;
};

export function getReviewCreatedEmailHtml({
  creatorName,
  reviewTitle,
  reviewUrl,
}: ReviewCreatedEmailProps): string {
  const safeCreator = escapeHtml(creatorName);
  const safeTitle = escapeHtml(reviewTitle);
  const safeUrl = escapeHtml(reviewUrl);
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
              <hr style="border:none;border-top:1px solid #ede8e0;margin:20px 0;"/>
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#6b1e2e;line-height:1.3;">
                ${safeCreator} has shared a design review with you
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#6b5e55;line-height:1.6;">
                You've been added as a reviewer on '${safeTitle}'. Please review the design and submit your feedback.
              </p>
              <a href="${safeUrl}" style="display:inline-block;background:#ffe96c;color:#2a221b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
                View Review
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;border-top:1px solid #ede8e0;">
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
