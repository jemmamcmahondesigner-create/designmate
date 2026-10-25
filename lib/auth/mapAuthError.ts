import { PASSWORD_RULES } from "@/lib/auth/passwordRules";

export type LoginFieldError = "error-password" | "error-email" | null;

export function mapSignInError(message: string): LoginFieldError {
  const m = message.toLowerCase();

  if (
    m.includes("user not found") ||
    m.includes("no user") ||
    m.includes("email not found") ||
    (m.includes("signups not allowed") && m.includes("email"))
  ) {
    return "error-email";
  }

  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid password") ||
    m.includes("wrong password") ||
    m.includes("incorrect password")
  ) {
    return "error-password";
  }

  return "error-password";
}

export function mapSignUpError(message: string): "email-error" | null {
  const m = message.toLowerCase();
  if (
    m.includes("already registered") ||
    m.includes("already exists") ||
    m.includes("user already")
  ) {
    return "email-error";
  }
  return null;
}

export function mapResetPasswordError(message: string): "email-error" | null {
  const m = message.toLowerCase();
  if (
    m.includes("user not found") ||
    m.includes("no user") ||
    m.includes("email not found")
  ) {
    return "email-error";
  }
  return null;
}

export function getPostAuthPath(
  userMetadata: Record<string, unknown> | undefined,
): string {
  if (userMetadata?.onboarding_complete !== true) {
    return "/onboarding";
  }
  return "/projects";
}

/** Same-origin relative path only — rejects protocol-relative and off-site URLs. */
export function getSafeInternalPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const path = raw.trim();
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//") || path.startsWith("/\\")) return null;
  if (path.includes("://")) return null;
  return path;
}

export function resolvePostLoginPath(
  userMetadata: Record<string, unknown> | undefined,
  next?: string | null,
): string {
  return getSafeInternalPath(next) ?? getPostAuthPath(userMetadata);
}

export function loginUrlForReturnPath(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

export function getSiteOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    return siteUrl.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export function isDuplicateEmailSignUpError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("already registered") || m.includes("user already registered");
}

export function getSignUpPasswordServerErrorMessage(error: {
  status?: number;
  code?: string;
  message?: string;
}): string | null {
  const msg = (error.message ?? "").toLowerCase();
  const isPasswordError =
    error.code === "weak_password" ||
    error.status === 422 ||
    msg.includes("password should") ||
    msg.includes("valid password");
  if (!isPasswordError) return null;
  return "That password doesn't meet the requirements. Try a different one.";
}

export function validateSignUpPassword(password: string): string | null {
  const unmet = PASSWORD_RULES.find((rule) => !rule.test(password));
  return unmet ? unmet.label : null;
}
