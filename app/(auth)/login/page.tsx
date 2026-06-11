"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthMark } from "@/components/auth/AuthMark";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { AuthTextLink } from "@/components/auth/AuthTextLink";
import { DesignTraceHeading } from "@/components/auth/DesignTraceHeading";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { OrDivider } from "@/components/auth/OrDivider";
import { Icon, Input } from "@/components/ui/ds";
import inputStyles from "@/components/ui/ds/Input.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getPostAuthPath,
  getSiteOrigin,
  mapSignInError,
  type LoginFieldError,
} from "@/lib/auth/mapAuthError";

type LoginStatus = "idle" | "loading" | "error-password" | "error-email";

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<LoginStatus>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        router.replace(getPostAuthPath(session.user.user_metadata));
      }
    };
    void checkSession();
  }, [router]);

  useEffect(() => {
    const emailParam = new URLSearchParams(window.location.search).get("email");
    if (emailParam) {
      setEmail(emailParam);
    }
  }, []);

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
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const fieldError = mapSignInError(error.message);
      setStatus(fieldError ?? "error-password");
      return;
    }

    if (data.user) {
      router.push(getPostAuthPath(data.user.user_metadata));
      router.refresh();
      return;
    }

    setStatus("idle");
  };

  const emailError = status === "error-email";
  const passwordError = status === "error-password";
  const isLoading = status === "loading";

  return (
    <AuthCard>
      <div className="flex w-full flex-col items-center gap-6">
        <AuthMark />
        <DesignTraceHeading prefix="Sign in to Design" centered />

        <GoogleSignInButton
          label="Continue with Google"
          onClick={() => void signInWithGoogle()}
        />

        <OrDivider />

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
              if (status === "error-email") setStatus("idle");
            }}
            error={emailError}
            errorMessage="No account found with this email."
            className="w-full"
          />

          <Input
            label="Password"
            type={passwordVisible ? "text" : "password"}
            size="lg"
            placeholder="Enter password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (status === "error-password") setStatus("idle");
            }}
            error={passwordError}
            errorMessage="Incorrect password. Please try again."
            className="w-full"
            trailingAction={
              <button
                type="button"
                className={inputStyles.trailingAction}
                onClick={() => setPasswordVisible((visible) => !visible)}
                aria-label={passwordVisible ? "Hide password" : "Show password"}
              >
                <Icon name={passwordVisible ? "eye-off" : "eye"} size={16} />
              </button>
            }
          />

          <AuthSubmitButton label="Log In" loading={isLoading} />
        </form>

        <AuthTextLink href="/reset-password" className="text-center">
          Reset Password
        </AuthTextLink>

        <p className="auth-footer-text">
          No account?
          <AuthTextLink href="/new-account"> Create one</AuthTextLink>
        </p>
      </div>
    </AuthCard>
  );
}
