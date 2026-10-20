import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getClientIp, rateLimit, rateLimitedResponse } from "@/lib/security/rateLimit";

const MAX_EMAIL_CHARS = 320;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const ipAllowed = await rateLimit(
      `check-email:ip:${getClientIp(request)}`,
      10,
      10 * 60,
    );
    if (!ipAllowed) {
      return rateLimitedResponse();
    }

    const emailRaw =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as { email?: unknown }).email
        : undefined;
    if (
      typeof emailRaw !== "string" ||
      !emailRaw.trim() ||
      emailRaw.length > MAX_EMAIL_CHARS
    ) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }

    const email = emailRaw.trim();
    const emailAllowed = await rateLimit(
      `check-email:email:${email.toLowerCase()}`,
      5,
      10 * 60,
    );
    if (!emailAllowed) {
      return rateLimitedResponse();
    }

    const supabase = createServiceClient();
    const normalized = email.toLowerCase();
    let page = 1;
    const perPage = 200;

    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

      if (error) {
        console.error("[check-email] listUsers failed:", error);
        return NextResponse.json({ error: "Unable to check email." }, { status: 500 });
      }

      const match = data.users.find((user) => (user.email ?? "").toLowerCase() === normalized);
      if (match) {
        return NextResponse.json({
          exists: match.email_confirmed_at != null,
        });
      }

      if (data.users.length < perPage) {
        break;
      }
      page += 1;
    }

    return NextResponse.json({ exists: false });
  } catch (err) {
    console.error("[check-email] unexpected error:", err);
    return NextResponse.json({ error: "Unable to check email." }, { status: 500 });
  }
}
