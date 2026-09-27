"use client";

import { Button } from "@/components/ui/ds";

type OnboardingAccountBarProps = {
  email: string;
  onSignOut: () => void;
  onDark?: boolean;
};

export function OnboardingAccountBar({
  email,
  onSignOut,
  onDark = false,
}: OnboardingAccountBarProps) {
  if (!email.trim()) return null;

  return (
    <div className="fixed right-8 top-8 z-[60] flex items-center gap-3">
      <p
        className="m-0 text-[13px] leading-[1.5]"
        style={{
          color: onDark ? "var(--text-inverse, #ffffff)" : "var(--text-tertiary, #998c82)",
        }}
      >
        {email}
      </p>
      <Button
        variant={onDark ? "ghost-on-dark" : "ghost"}
        size="sm"
        label="Sign out"
        onClick={onSignOut}
      />
    </div>
  );
}
