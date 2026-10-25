export type PasswordRuleId = "length" | "uppercase" | "lowercase" | "number" | "special";

export type PasswordRule = {
  id: PasswordRuleId;
  label: string;
  test: (password: string) => boolean;
};

/** Characters Supabase accepts for the special-character rule. */
const SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{};\\':\"|<>?,./`~";

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "uppercase",
    label: "An uppercase letter",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: "lowercase",
    label: "A lowercase letter",
    test: (password) => /[a-z]/.test(password),
  },
  {
    id: "number",
    label: "A number",
    test: (password) => /[0-9]/.test(password),
  },
  {
    id: "special",
    label: "A special character (e.g. ! @ # $)",
    test: (password) => Array.from(password).some((char) => SPECIAL_CHARACTERS.includes(char)),
  },
];

export function unmetPasswordRuleIds(password: string): PasswordRuleId[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.id);
}

export function passwordMeetsRules(password: string): boolean {
  return unmetPasswordRuleIds(password).length === 0;
}

const UNMAPPED_PASSWORD_MESSAGE =
  "That password doesn't meet the requirements. Try a different one.";

export type PasswordServerFailure =
  | { kind: "rules"; ids: PasswordRuleId[] }
  | { kind: "alert"; message: string };

/**
 * Map a Supabase password rejection onto the rules it failed.
 * Anything that is not one of those rules becomes a plain-language alert.
 */
export function mapPasswordServerError(
  message: string,
  password: string,
): PasswordServerFailure {
  const lower = message.trim().toLowerCase();

  if (/at least \d+ characters/.test(lower)) {
    return { kind: "rules", ids: ["length"] };
  }

  if (lower.includes("at least one character of each")) {
    const ids = unmetPasswordRuleIds(password).filter((id) => id !== "length");
    if (ids.length > 0) return { kind: "rules", ids };
    return { kind: "alert", message: UNMAPPED_PASSWORD_MESSAGE };
  }

  if (
    lower.includes("different from") ||
    lower.includes("same as") ||
    lower.includes("previously used")
  ) {
    return {
      kind: "alert",
      message: "Choose a password you haven't used before.",
    };
  }

  return {
    kind: "alert",
    message: "That password couldn't be saved. Try a different one.",
  };
}
