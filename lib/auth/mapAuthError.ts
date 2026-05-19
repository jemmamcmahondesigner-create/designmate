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

const SIGNUP_PASSWORD_REQUIREMENTS_MESSAGE =
  "Password must meet requirements: min. 8 characters with uppercase, lowercase, number and symbol.";

export function getSignUpPasswordServerErrorMessage(error: {
  status?: number;
  message?: string;
}): string | null {
  const msg = (error.message ?? "").toLowerCase();
  if (
    error.status === 400 ||
    msg.includes("valid password") ||
    msg.includes("password should be")
  ) {
    return SIGNUP_PASSWORD_REQUIREMENTS_MESSAGE;
  }
  return null;
}

export function validateSignUpPassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return "Password must include at least one symbol (e.g. !@#$%).";
  }
  return null;
}
