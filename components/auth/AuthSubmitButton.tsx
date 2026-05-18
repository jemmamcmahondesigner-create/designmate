"use client";

import { Button } from "@/components/ui/ds";
import buttonStyles from "@/components/ui/ds/Button.module.css";
import { SpinnerIcon } from "./SpinnerIcon";

export type AuthSubmitButtonProps = {
  label: string;
  loading?: boolean;
  loadingLabel?: string;
  type?: "button" | "submit";
  disabled?: boolean;
};

export function AuthSubmitButton({
  label,
  loading = false,
  loadingLabel,
  type = "submit",
  disabled = false,
}: AuthSubmitButtonProps) {
  if (loading) {
    const className = [
      buttonStyles.root,
      buttonStyles["variant-primary"],
      buttonStyles["size-lg"],
      "auth-submit-btn",
      "w-full",
    ].join(" ");

    return (
      <button
        type={type}
        className={className}
        style={{ width: "100%" }}
        disabled
        aria-disabled
        aria-busy
        aria-label={loadingLabel ?? label}
      >
        <SpinnerIcon size={18} className="animate-spin" />
      </button>
    );
  }

  return (
    <Button
      type={type}
      variant="primary"
      size="lg"
      label={label}
      disabled={disabled}
      className="auth-submit-btn w-full"
      style={{ width: "100%" }}
    />
  );
}
