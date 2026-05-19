"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthMark } from "@/components/auth/AuthMark";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { AuthTextLink } from "@/components/auth/AuthTextLink";
import { DesignTraceHeading } from "@/components/auth/DesignTraceHeading";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { InputLockIcon } from "@/components/auth/InputLockIcon";
import { OrDivider } from "@/components/auth/OrDivider";
import { useResendCooldown } from "@/components/auth/useResendCooldown";
import { Alert, Button, Input } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getSignUpPasswordServerErrorMessage,
  getSiteOrigin,
  validateSignUpPassword,
} from "@/lib/auth/mapAuthError";
import { INVITE_CODE_STORAGE_KEY } from "@/lib/workspace/invite-client";

type NewAccountStatus = "idle" | "loading" | "email-sent";

function NewAccountPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<NewAccountStatus>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailExistsError, setEmailExistsError] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const { cooldown, startCooldown, canResend } = useResendCooldown(60);

  useEffect(() => {
    const code = searchParams.get("invite_code")?.trim();
    const inviteEmail = searchParams.get("email")?.trim();

    if (inviteEmail) {
      setEmail(inviteEmail);
    }

    if (code) {
      setInviteCode(code);
      window.localStorage.setItem(INVITE_CODE_STORAGE_KEY, code);
    }
  }, [searchParams]);

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

    const passwordValidationError = validateSignUpPassword(password);
    if (passwordValidationError) {
      setPasswordError(passwordValidationError);
      return;
    }

    setPasswordError(null);
    setEmailExistsError(false);
    setStatus("loading");

    const trimmedEmail = email.trim();

    try {
      const checkRes = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (checkRes.ok) {
        const { exists } = (await checkRes.json()) as { exists?: boolean };
        if (exists === true) {
          setEmailExistsError(true);
          setStatus("idle");
          return;
        }
      }
    } catch {
      // If the check fails, allow signUp to proceed.
    }

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: `${getSiteOrigin()}/auth/confirm`,
      },
    });

    if (error) {
      const passwordServerError = getSignUpPasswordServerErrorMessage(error);
      if (passwordServerError) {
        setPasswordError(passwordServerError);
      }
      setStatus("idle");
      return;
    }

    if (data.session) {
      router.push("/onboarding");
      router.refresh();
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
      options: {
        emailRedirectTo: `${getSiteOrigin()}/auth/confirm`,
      },
    });
    startCooldown();
  };

  const isLoading = status === "loading";
  const emailLocked = Boolean(inviteCode);

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
            className="m-0 max-w-[420px] text-center text-[15px] font-normal leading-normal"
            style={{ color: "var(--text-secondary, #6b5e55)" }}
          >
            We&apos;ve sent a link to &quot;{email}&quot;
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
          <p
            className="m-0 max-w-[420px] text-center text-[12px] font-normal leading-[1.5]"
            style={{ color: "var(--text-tertiary, #998c82)" }}
          >
            Didn&apos;t receive the email? Check your inbox and spam before resending.
          </p>
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

        {inviteCode ? (
          <div className="w-full">
            <Alert
              sentiment="base"
              prominence="low"
              title="You've been invited to join a workspace. Create your account to accept."
              dismissible={false}
            />
          </div>
        ) : null}

        <GoogleSignInButton onClick={() => void signInWithGoogle()} />

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
              disabled={emailLocked}
              trailingAction={emailLocked ? <InputLockIcon /> : undefined}
              onChange={(e) => {
                if (emailLocked) return;
                setEmail(e.target.value);
                if (emailExistsError) setEmailExistsError(false);
              }}
              error={emailExistsError}
              errorMessage={
                emailExistsError ? (
                  <>
                    An account already exists with this email.{" "}
                    <AuthTextLink
                      href={`/login?email=${encodeURIComponent(email.trim())}`}
                      className="text-[12px] leading-[1.5]"
                      style={{ color: "var(--text-link, #6b1e2e)" }}
                    >
                      Log in instead
                    </AuthTextLink>
                    .
                  </>
                ) : undefined
              }
              className="w-full"
            />

            <Input
              label="Password"
              type="password"
              size="lg"
              placeholder="Enter a unique 8 digit password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
              error={Boolean(passwordError)}
              errorMessage={passwordError ?? undefined}
              helperText="Min. 8 characters with uppercase, lowercase, number and symbol."
              showHelper={!passwordError}
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

export default function NewAccountPage() {
  return (
    <Suspense fallback={null}>
      <NewAccountPageContent />
    </Suspense>
  );
}
