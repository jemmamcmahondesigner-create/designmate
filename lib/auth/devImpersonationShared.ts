/** Shared dev impersonation flags + cookie name (no `server-only` — safe for client bundles). */

export const DEV_IMPERSONATION_COOKIE = "designtrace_dev_contributor_id";

export function isDevImpersonationEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_USER_SWITCHER === "true"
  );
}
