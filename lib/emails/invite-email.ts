export const DESIGN_TRACE_RESEND_FROM = "DesignTrace <hello@designtrace.ai>";
import { getDesignTraceWordmarkHtml } from "@/lib/emails/brand-wordmark";

export type InviteEmailProps = {
  inviterName: string;
  workspaceName: string;
  inviteUrl: string;
};

export function getInviteEmailHtml({
  inviterName,
  workspaceName,
  inviteUrl,
}: InviteEmailProps): string {
  const safeInviter = escapeHtml(inviterName);
  const safeWorkspace = escapeHtml(workspaceName);
  const safeUrl = escapeHtml(inviteUrl);
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
              <p style="margin:0 0 20px;font-size:20px;line-height:1.2;">
                ${getDesignTraceWordmarkHtml()}
              </p>
              <hr style="border:none;border-top:1px solid #ede8e0;margin:20px 0;"/>
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#6b1e2e;line-height:1.3;">
                ${safeInviter} has invited you to join ${safeWorkspace}
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#6b5e55;line-height:1.6;">
                You've been invited to collaborate on design reviews, feedback, and decisions. Join the workspace to access projects and contribute to the team's design process.
              </p>
              <a href="${safeUrl}" style="display:inline-block;background:#ffe96c;color:#2a221b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
                Accept Invitation
              </a>
              <p style="margin:24px 0 0;font-size:12px;color:#998c82;">
                This invitation expires in 7 days.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;border-top:1px solid #ede8e0;">
              <p style="margin:0;font-size:12px;color:#c9c0b4;text-align:center;">
                If you weren't expecting this invitation, you can safely ignore this email.
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
