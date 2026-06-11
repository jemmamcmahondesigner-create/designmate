import { escapeHtml } from "@/lib/emails/escape-html";
import { getDesignTraceWordmarkHtml } from "@/lib/emails/brand-wordmark";

export type ProjectCompletedEmailProps = {
  actorName: string;
  projectName: string;
  projectUrl: string;
};

export function getProjectCompletedEmailHtml({
  actorName,
  projectName,
  projectUrl,
}: ProjectCompletedEmailProps): string {
  const safeActor = escapeHtml(actorName);
  const safeProject = escapeHtml(projectName);
  const safeUrl = escapeHtml(projectUrl);
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
                ${safeProject} has been completed
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#6b5e55;line-height:1.6;">
                ${safeActor} has marked ${safeProject} as complete.<br/><br/>
                All active reviews have been updated. You can view the project here:
              </p>
              <a href="${safeUrl}" style="display:inline-block;background:#ffe96c;color:#2a221b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
                View Project
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;border-top:1px solid #ede8e0;">
              <p style="margin:0;font-size:12px;color:#c9c0b4;text-align:center;">
                You're receiving this because you're a contributor on this project.
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
