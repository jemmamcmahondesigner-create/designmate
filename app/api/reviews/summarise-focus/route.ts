import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const SUMMARY_SYSTEM_PROMPT =
  "Summarise the following review focus in 2-3 sentences, maximum 50 words. Write in plain present tense. Return only the summary, no preamble, no quotes.";

function trimmedOrNull(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      reviewId?: string;
      reviewFocus?: string;
    };
    const reviewId = String(body.reviewId ?? "").trim();
    const reviewFocus = trimmedOrNull(body.reviewFocus);

    if (!reviewId || !reviewFocus) {
      return NextResponse.json(
        { error: "reviewId and reviewFocus are required." },
        { status: 400 },
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI is not configured." },
        { status: 500 },
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 160,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: reviewFocus,
        },
      ],
    });
    const block = message.content.find((item) => item.type === "text");
    const summary = trimmedOrNull(block?.type === "text" ? block.text : "");

    if (!summary) {
      return NextResponse.json(
        { error: "No summary was returned." },
        { status: 500 },
      );
    }

    const serviceSupabase = createServiceClient();
    const { error: updateError } = await serviceSupabase
      .from("reviews")
      .update({
        review_focus_summary: summary,
        review_focus_summary_source: reviewFocus,
      })
      .eq("id", reviewId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to summarise review focus.",
      },
      { status: 500 },
    );
  }
}
