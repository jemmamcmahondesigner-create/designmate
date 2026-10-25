import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSafeInternalPath } from "@/lib/auth/mapAuthError";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES = new Set<string>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");

  const emailParam = searchParams.get("email");

  const loginWithConfirmationError = () => {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "confirmation-failed");
    if (emailParam) {
      loginUrl.searchParams.set("email", emailParam);
    }
    return NextResponse.redirect(loginUrl.toString());
  };

  if (!token_hash || !typeParam || !OTP_TYPES.has(typeParam)) {
    return loginWithConfirmationError();
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: typeParam as EmailOtpType,
  });

  if (error) {
    if (typeParam === "recovery") {
      return NextResponse.redirect(`${origin}/reset-password?error=link-expired`);
    }
    return loginWithConfirmationError();
  }

  const requestedNext = getSafeInternalPath(searchParams.get("next"));
  const destination =
    requestedNext ?? (typeParam === "recovery" ? "/auth/update-password" : "/onboarding");
  return NextResponse.redirect(`${origin}${destination}`);
}
