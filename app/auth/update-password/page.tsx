"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthMark } from "@/components/auth/AuthMark";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { Input } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PagePhase = "exchanging" | "ready" | "submitting";

function UpdatePasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const exchangeStarted = useRef(false);

  const [phase, setPhase] = useState<PagePhase>("exchanging");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmMismatch, setConfirmMismatch] = useState(false);

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    const code = searchParams.get("code");
    if (!code) {
      router.replace("/reset-password?error=link-expired");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        router.replace("/reset-password?error=link-expired");
        return;
      }

      setPhase("ready");
      router.replace("/auth/update-password", { scroll: false });
    });
  }, [router, searchParams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      setConfirmMismatch(true);
      return;
    }

    setConfirmMismatch(false);
    setPhase("submitting");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setPhase("ready");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  if (phase === "exchanging") {
    return (
      <AuthCard centered>
        <div className="flex w-full flex-col items-center gap-6">
          <AuthMark />
          <p
            className="m-0 text-center text-[15px] font-normal leading-normal"
            style={{ color: "var(--text-secondary, #6b5e55)" }}
          >
            Verifying your link…
          </p>
        </div>
      </AuthCard>
    );
  }

  const isSubmitting = phase === "submitting";

  return (
    <AuthCard>
      <div className="flex w-full flex-col items-center gap-6">
        <AuthMark />
        <h2
          className="m-0 w-full text-center text-[24px] font-bold leading-[1.3]"
          style={{
            color: "var(--text-secondary, #6b5e55)",
            letterSpacing: "-0.36px",
          }}
        >
          Set your new password
        </h2>

        <form
          className="flex w-full flex-col gap-6"
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
        >
          <Input
            label="New password"
            type="password"
            size="lg"
            placeholder="Enter a unique 8 digit password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (confirmMismatch) setConfirmMismatch(false);
            }}
            helperText="Must have 1 number and 1 special character."
            showHelper
            className="w-full"
          />

          <Input
            label="Confirm new password"
            type="password"
            size="lg"
            placeholder="Confirm your password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (confirmMismatch) setConfirmMismatch(false);
            }}
            error={confirmMismatch}
            errorMessage="Passwords must match."
            className="w-full"
          />

          <AuthSubmitButton
            label="Update password"
            loading={isSubmitting}
            disabled={!password.trim() || !confirmPassword.trim()}
          />
        </form>
      </div>
    </AuthCard>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordContent />
    </Suspense>
  );
}
