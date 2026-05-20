import { escapeHtml } from "@/lib/emails/escape-html";

export type DecisionRecordedEmailProps = {
  creatorName: string;
  decisionMakerName: string;
  reviewTitle: string;
  decisionStatus: "approved" | "changes-needed";
  decisionText: string | null;
  tradeOffNote: string | null;
  reviewUrl: string;
};

function emailTextBlock(label: string, text: string) {
  const safe = escapeHtml(text);
  return `
              <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#998c82;letter-spacing:0.5px;text-transform:uppercase;">
                ${label}
              </p>
              <p style="margin:0 0 24px;font-size:14px;font-weight:400;color:#2e1c1c;line-height:1.5;background:#f3efe9;border-radius:6px;padding:12px;">
                ${safe}
              </p>`;
}

export function getDecisionRecordedEmailHtml({
  creatorName,
  decisionMakerName,
  reviewTitle,
  decisionStatus,
  decisionText,
  tradeOffNote,
  reviewUrl,
}: DecisionRecordedEmailProps): string {
  const safeCreator = escapeHtml(creatorName);
  const safeMaker = escapeHtml(decisionMakerName);
  const safeTitle = escapeHtml(reviewTitle);
  const safeUrl = escapeHtml(reviewUrl);

  const isApproved = decisionStatus === "approved";
  const heading = isApproved
    ? `Direction approved on ${safeTitle}`
    : `Direction confirmed with changes needed on ${safeTitle}`;
  const badgeStyle = isApproved
    ? "background:#e6f4ea;color:#1e6b3a;"
    : "background:#f5eaec;color:#6b1e2e;";
  const badgeText = isApproved
    ? "Direction Approved"
    : "Direction Confirmed, Changes Needed";

  const rationaleTrimmed = (decisionText ?? "").trim();
  const rationaleBlock =
    rationaleTrimmed.length > 0
      ? emailTextBlock("DECISION RATIONALE", rationaleTrimmed)
      : "";

  const tradeOffTrimmed = (tradeOffNote ?? "").trim();
  const tradeOffBlock =
    tradeOffTrimmed.length > 0
      ? emailTextBlock("TRADE-OFF ACCEPTED", tradeOffTrimmed)
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
              <p style="margin:0 0 20px;font-size:22px;line-height:1.2;">
                <span style="font-weight:800;color:#6b1e2e;">Design</span><span style="font-weight:300;color:#a0384f;">Trace</span>
              </p>
              <hr style="border:none;border-top:1px solid #ede8e0;margin:0 0 24px;"/>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#6b1e2e;line-height:1.3;">
                ${heading}
              </h2>
              <p style="margin:0 0 16px;font-size:15px;font-weight:400;color:#6b5e55;line-height:1.5;">
                Hi ${safeCreator}, ${safeMaker} has recorded the final decision.
              </p>
              <p style="margin:0 0 24px;">
                <span style="display:inline-block;${badgeStyle}border-radius:20px;padding:4px 12px;font-size:13px;font-weight:600;">
                  ${badgeText}
                </span>
              </p>
              ${rationaleBlock}
              ${tradeOffBlock}
              <a href="${safeUrl}" style="display:inline-block;background:#ffe96c;color:#2a221b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;border:none;">
                View Decision on DesignTrace
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
