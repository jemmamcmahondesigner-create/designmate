"use client";

import buttonStyles from "@/components/ui/ds/Button.module.css";
import { GoogleIcon } from "./GoogleIcon";

export type GoogleSignInButtonProps = {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
};

export function GoogleSignInButton({
  label = "Continue with Google",
  onClick,
  disabled = false,
}: GoogleSignInButtonProps) {
  const className = [
    buttonStyles.root,
    buttonStyles["variant-secondary"],
    buttonStyles["size-lg"],
    "auth-google-btn",
    "w-full",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      style={{ width: "100%" }}
      disabled={disabled}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      <span className={buttonStyles.icon}>
        <GoogleIcon size={16} />
      </span>
      <span className={buttonStyles.label}>{label}</span>
    </button>
  );
}
