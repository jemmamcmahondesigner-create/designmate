"use client";

import { FormEvent, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthMark } from "@/components/auth/AuthMark";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { AuthTextLink } from "@/components/auth/AuthTextLink";
import { DesignTraceHeading } from "@/components/auth/DesignTraceHeading";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { OrDivider } from "@/components/auth/OrDivider";
import { Input } from "@/components/ui/ds";
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
          disabled={isLoading}
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
            disabled={isLoading}
            className="w-full"
          />

          <Input
            label="Password"
            type="password"
            size="lg"
            placeholder="Enter a unique 8 digit password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (status === "error-password") setStatus("idle");
            }}
            error={passwordError}
            errorMessage="Incorrect password. Please try again."
            disabled={isLoading}
            className="w-full"
          />

          <AuthSubmitButton label="Log In" loading={isLoading} />
        </form>

        <AuthTextLink href="/reset-password" className="text-center">
          Reset Password
        </AuthTextLink>

        <p className="m-0 text-center text-[15px] leading-normal">
          <span style={{ color: "var(--text-tertiary, #998c82)" }}>No account?</span>
          <AuthTextLink href="/new-account"> Create one</AuthTextLink>
        </p>
      </div>
    </AuthCard>
  );
}
