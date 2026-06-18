const DESIGN_TRACE_WORDMARK_LOGO_URL =
  "https://gushydvliscbciehvwbl.supabase.co/storage/v1/object/public/project-references/brand/DesignTrace_Wordmark_Logo.png";

/** Inline logo header block for transactional email templates (Outlook-safe). */
export function getDesignTraceWordmarkHtml(): string {
  return `<div style="padding:24px 0 16px 0;">
  <img
    src="${DESIGN_TRACE_WORDMARK_LOGO_URL}"
    alt="DesignTrace"
    width="160"
    style="display:block;height:auto;border:0;"
  />
</div>`;
}
