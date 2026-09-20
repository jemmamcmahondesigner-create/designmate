import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePostLoginPath } from "@/lib/auth/mapAuthError";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const path = resolvePostLoginPath(data.user.user_metadata, next);
      return NextResponse.redirect(`${origin}${path}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
