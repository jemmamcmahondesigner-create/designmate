import { escapeHtml } from "@/lib/emails/escape-html";
import { getDesignTraceWordmarkHtml } from "@/lib/emails/brand-wordmark";

export type ChangeRequestEmailProps = {
  creatorName: string;
  reviewTitle: string;
  reviewFocus: string | null;
  reviewUrl: string;
  changes: Array<{
    reviewerName: string;
    artifactName: string | null;
    changesNeeded: string | null;
  }>;
};

function block(label: string, text: string) {
  return `
              <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#998c82;letter-spacing:0.5px;text-transform:uppercase;">
                ${label}
              </p>
              <p style="margin:0 0 16px;font-size:14px;font-weight:400;color:#2e1c1c;line-height:1.5;background:#fef8dc;border-left:3px solid #e5b025;border-radius:6px;padding:12px;">
                ${escapeHtml(text)}
              </p>`;
}

export function getChangeRequestEmailHtml({
  creatorName,
  reviewTitle,
  reviewFocus,
  reviewUrl,
  changes,
}: ChangeRequestEmailProps): string {
  const safeCreator = escapeHtml(creatorName);
  const safeTitle = escapeHtml(reviewTitle);
  const safeUrl = escapeHtml(reviewUrl);
  const focusTrimmed = String(reviewFocus ?? "").trim();
  const focusBlock =
    focusTrimmed.length > 0 ? block("REVIEW FOCUS", focusTrimmed) : "";
  const changesBlock = changes
    .map((change, index) => {
      const reviewer = escapeHtml(change.reviewerName);
      const artifact = escapeHtml((change.artifactName ?? "").trim());
      const text = (change.changesNeeded ?? "").trim() || "Change requested.";
      const heading = artifact
        ? `CHANGE ${index + 1} · ${reviewer} on ${artifact}`
        : `CHANGE ${index + 1} · ${reviewer}`;
      return block(heading, text);
    })
    .join("");

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
              <p style="margin:0 0 20px;font-size:22px;line-height:1.2;">
                ${getDesignTraceWordmarkHtml()}
              </p>
              <hr style="border:none;border-top:1px solid #ede8e0;margin:0 0 24px;"/>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#6b1e2e;line-height:1.3;">
                New change requests on ${safeTitle}
              </h2>
              <p style="margin:0 0 24px;font-size:15px;font-weight:400;color:#6b5e55;line-height:1.5;">
                Hi ${safeCreator}, one or more reviewers requested changes on this review.
              </p>
              ${focusBlock}
              ${changesBlock}
              <a href="${safeUrl}" style="display:inline-block;background:#ffe96c;color:#2a221b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;border:none;">
                View Review on DesignTrace
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
