import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
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

  if (!token_hash || !typeParam || !OTP_TYPES.has(typeParam)) {
    return NextResponse.redirect(`${origin}/login?error=confirmation-failed`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: typeParam as EmailOtpType,
  });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=confirmation-failed`);
  }

  return NextResponse.redirect(`${origin}/onboarding`);
}
