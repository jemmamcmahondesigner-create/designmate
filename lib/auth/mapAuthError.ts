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
  return userMetadata?.onboarding_complete === false ? "/onboarding" : "/dashboard";
}

export function getSiteOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "";
}
