import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "email is required." }, { status: 400 });
  }

  try {
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
