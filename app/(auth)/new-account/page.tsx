"use client";

import { FormEvent, useCallback, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthMark } from "@/components/auth/AuthMark";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { AuthTextLink } from "@/components/auth/AuthTextLink";
import { DesignTraceHeading } from "@/components/auth/DesignTraceHeading";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { OrDivider } from "@/components/auth/OrDivider";
import { useResendCooldown } from "@/components/auth/useResendCooldown";
import { Button, Input } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSiteOrigin, mapSignUpError } from "@/lib/auth/mapAuthError";

type NewAccountStatus = "idle" | "loading" | "email-error" | "email-sent";

export default function NewAccountPage() {
  const [status, setStatus] = useState<NewAccountStatus>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      const fieldError = mapSignUpError(error.message);
      setStatus(fieldError === "email-error" ? "email-error" : "idle");
      return;
    }

    startCooldown();
    setStatus("email-sent");
  };

  const handleResend = async () => {
    if (!canResend || !email.trim()) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
    });
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
            An email confirmation has been sent. Check your email!
          </h2>
          <p
            className="m-0 max-w-[420px] text-center text-[12px] font-normal leading-[1.5]"
            style={{ color: "var(--text-tertiary, #998c82)" }}
          >
            Didn&apos;t receive the email? Check your inbox and spam before resending.
          </p>
          <Button
            variant="accent"
            size="lg"
            label={
              canResend
                ? "Re-send confirmation email"
                : `Re-send confirmation email (${cooldown}s)`
            }
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
        <DesignTraceHeading prefix="Welcome to Design" centered />
        <p
          className="m-0 w-full text-center text-[24px] font-bold leading-[1.3]"
          style={{
            color: "var(--text-secondary, #6b5e55)",
            letterSpacing: "-0.36px",
          }}
        >
          Let&apos;s create you a new account!
        </p>

        <GoogleSignInButton
          onClick={() => void signInWithGoogle()}
        />

        <OrDivider />

        <form
          className="flex w-full flex-col gap-6"
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
        >
          <div className="flex w-full flex-col gap-6">
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
              }}
              error={emailError}
              errorMessage="An account with this email already exists. Log in instead."
              className="w-full"
            />

            <Input
              label="Password"
              type="password"
              size="lg"
              placeholder="Enter a unique 8 digit password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              helperText="Password must have 1 number and 1 special character."
              showHelper
              className="w-full"
            />
          </div>

          <AuthSubmitButton label="Continue with email" loading={isLoading} />
        </form>

        <p className="m-0 text-center text-[15px] leading-normal">
          <span style={{ color: "var(--text-tertiary, #998c82)" }}>
            Have an account already?
          </span>
          <AuthTextLink href="/login"> Log in</AuthTextLink>
        </p>
      </div>
    </AuthCard>
  );
}
