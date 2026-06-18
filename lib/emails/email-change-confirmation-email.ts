/**
 * Branded HTML for Supabase Auth "Change email address" confirmation.
 *
 * IMPORTANT — delivery is via Supabase Auth, not Resend:
 * `supabase.auth.updateUser({ email })` triggers Supabase to send the confirmation
 * email using the template configured in the Supabase Dashboard.
 *
 * To use this design, paste the HTML below into:
 *   Supabase Dashboard → Authentication → Email Templates → Change email address
 *
 * Supabase template variables (Go syntax):
 *   {{ .ConfirmationURL }} — confirmation link (use as the CTA href)
 *   {{ .Email }}           — current email address
 *   {{ .NewEmail }}        — requested new email address
 *
 * For a Resend-only preview or custom hook, call getEmailChangeConfirmationHtml()
 * with explicit values. Production auth email change still uses the dashboard template.
 */
import { escapeHtml } from "@/lib/emails/escape-html";
import { getDesignTraceWordmarkHtml } from "@/lib/emails/brand-wordmark";

export const EMAIL_CHANGE_CONFIRMATION_SUBJECT = "Confirm your new email address";

/** Intended sender when sending via Resend (Supabase uses its own mailer for auth emails). */
export const EMAIL_CHANGE_CONFIRMATION_FROM = "DesignTrace <hello@designtrace.ai>";

export type EmailChangeConfirmationProps = {
  newEmail: string;
  confirmationUrl: string;
};

export function getEmailChangeConfirmationHtml({
  newEmail,
  confirmationUrl,
}: EmailChangeConfirmationProps): string {
  const safeNewEmail = escapeHtml(newEmail);
  const safeUrl = escapeHtml(confirmationUrl);
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
                Confirm email change
              </h2>
              <p style="margin:0 0 24px;font-size:15px;color:#6b5e55;line-height:1.6;">
                You requested a change to your DesignTrace email address.
                Click the button below to confirm your new address: <strong style="color:#2e1c1c;">${safeNewEmail}</strong>
              </p>
              <a href="${safeUrl}" style="display:inline-block;background:#ffe96c;color:#2a221b;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
                Confirm email change
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;border-top:1px solid #ede8e0;">
              <p style="margin:0;font-size:12px;color:#c9c0b4;text-align:center;">
                If you didn't request this change, you can safely ignore this email.
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

/**
 * Supabase Dashboard template body — replace placeholders with Go variables.
 * Paste into Authentication → Email Templates → Change email address.
 */
export function getSupabaseEmailChangeConfirmationTemplateHtml(): string {
  return getEmailChangeConfirmationHtml({
    newEmail: "{{ .NewEmail }}",
    confirmationUrl: "{{ .ConfirmationURL }}",
  });
}
