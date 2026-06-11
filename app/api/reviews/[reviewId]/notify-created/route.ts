import { NextResponse } from "next/server";
import { sendReviewCreatedNotifications } from "@/lib/reviews/send-review-created-notifications";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: { params: { reviewId: string } },
) {
  const reviewId = context.params.reviewId?.trim();
  if (!reviewId) {
    return NextResponse.json({ error: "Review id is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await sendReviewCreatedNotifications(supabase, reviewId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[review-notify-created]", err);
    return NextResponse.json({ error: "Failed to send notifications." }, { status: 500 });
  }
}
