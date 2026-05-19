export const DESIGN_TRACE_RESEND_FROM = "DesignTrace <hello@designtrace.ai>";

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
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DesignTrace invitation</title>
</head>
<body style="margin:0;padding:0;background-color:#faf8f6;font-family:'Plus Jakarta Sans',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#faf8f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="background-color:#ffffff;border:1px solid #ede8e0;border-radius:12px;padding:32px 40px;">
              <p style="margin:0 0 16px;font-size:20px;line-height:1.3;">
                <span style="font-weight:800;color:#6b1e2e;">Design</span><span style="font-weight:300;color:#a0384f;">Trace</span>
              </p>
              <hr style="border:none;border-top:1px solid #ede8e0;margin:0 0 24px;" />
              <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;line-height:1.3;color:#6b1e2e;">
                ${safeInviter} has invited you to join ${safeWorkspace}
              </h1>
              <p style="margin:0 0 24px;font-size:15px;font-weight:400;line-height:1.5;color:#6b5e55;">
                You&apos;ve been invited to collaborate on design reviews, feedback, and decisions.
                Join the workspace to access projects and contribute to the team&apos;s design process.
              </p>
              <p style="margin:0 0 24px;">
                <a href="${safeUrl}" style="display:inline-block;background-color:#ffe96c;color:#2a221b;font-weight:600;font-size:15px;text-decoration:none;border-radius:8px;padding:12px 24px;">
                  Accept Invitation
                </a>
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:#998c82;">
                This invitation expires in 7 days.
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#c9c0b4;text-align:center;">
                If you weren&apos;t expecting this invitation, you can safely ignore this email.
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
