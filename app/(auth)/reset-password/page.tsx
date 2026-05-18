"use client";

import { FormEvent, useCallback, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthMark } from "@/components/auth/AuthMark";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { AuthTextLink } from "@/components/auth/AuthTextLink";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { OrDivider } from "@/components/auth/OrDivider";
import { useResendCooldown } from "@/components/auth/useResendCooldown";
import { Button, Input } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSiteOrigin, mapResetPasswordError } from "@/lib/auth/mapAuthError";

type ResetStatus = "idle" | "loading" | "email-error" | "email-sent";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<ResetStatus>("idle");
  const [email, setEmail] = useState("");
  const [generalError, setGeneralError] = useState<string | null>(null);
  const { cooldown, startCooldown, canResend } = useResendCooldown(60);

  const signInWithGoogle = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${getSiteOrigin()}/auth/callback`,
      },
    });
  }, []);

  const redirectTo = `${getSiteOrigin()}/auth/update-password`;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (error) {
      const fieldError = mapResetPasswordError(error.message);
      if (fieldError === "email-error") {
        setStatus("email-error");
      } else {
        setGeneralError(error.message);
        setStatus("idle");
      }
      return;
    }

    startCooldown();
    setStatus("email-sent");
  };

  const handleResend = async () => {
    if (!canResend || !email.trim()) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    startCooldown();
  };

  const isLoading = status === "loading";
  const emailError = status === "email-error";

  if (status === "email-sent") {
    return (
      <AuthCard centered>
        <div className="flex w-full flex-col items-center gap-6">
          <AuthMark />
          <h2
            className="m-0 text-center text-[24px] font-bold leading-[1.3]"
            style={{
              color: "var(--text-secondary, #6b5e55)",
              letterSpacing: "-0.36px",
            }}
          >
            A password reset has been sent. Check your email!
          </h2>
          <p
            className="m-0 max-w-[420px] text-center text-[12px] font-normal leading-[1.5]"
            style={{ color: "var(--text-tertiary, #998c82)" }}
          >
            Didn&apos;t receive the reset? Check your inbox and spam before resending.
          </p>
          <Button
            variant="accent"
            size="lg"
            label={canResend ? "Re-send password" : `Re-send password (${cooldown}s)`}
            disabled={!canResend}
            onClick={() => void handleResend()}
            className="w-full"
            style={{ width: "100%" }}
          />
        </div>
      </AuthCard>
    );
  }

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
          Enter your email to reset your password
        </h2>

        <form
          className="flex w-full flex-col gap-6"
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
        >
          <Input
            label="Email Address"
            type="email"
            size="lg"
            placeholder="Email address"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "email-error") setStatus("idle");
              if (generalError) setGeneralError(null);
            }}
            error={emailError}
            errorMessage="No account found with this email."
            className="w-full"
          />

          <AuthSubmitButton label="Reset password" loading={isLoading} />
          {generalError ? (
            <p
              role="alert"
              className="m-0 text-[12px] font-normal leading-normal"
              style={{ color: "var(--feedback-error-text, #8b2020)" }}
            >
              {generalError}
            </p>
          ) : null}
        </form>

        <AuthTextLink href="/login" className="text-center">
          Cancel
        </AuthTextLink>

        <OrDivider />

        <GoogleSignInButton onClick={() => void signInWithGoogle()} />
      </div>
    </AuthCard>
  );
}
