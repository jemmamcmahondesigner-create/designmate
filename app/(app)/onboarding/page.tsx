"use client";

import { useSearchParams } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite_code");
  const inviteEmail = searchParams.get("email");

  return (
    <OnboardingFlow
      inviteCode={inviteCode ?? undefined}
      inviteEmail={inviteEmail ?? undefined}
    />
  );
}
