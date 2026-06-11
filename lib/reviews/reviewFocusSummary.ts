export type ReviewFocusSummaryInput = {
  id: string;
  reviewFocus: string | null;
  existingSummary?: string | null;
  existingSource?: string | null;
};

function trimmedOrNull(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function summariseFocusUrl() {
  if (typeof window !== "undefined") {
    return "/api/reviews/summarise-focus";
  }
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/api/reviews/summarise-focus`;
}

async function requestReviewFocusSummary(input: {
  reviewId: string;
  reviewFocus: string;
}): Promise<string | null> {
  const response = await fetch(summariseFocusUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reviewId: input.reviewId,
      reviewFocus: input.reviewFocus,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(async () => ({ error: await response.text() }));
    throw new Error(
      typeof body?.error === "string" && body.error.trim()
        ? body.error
        : "Failed to summarise review focus.",
    );
  }

  const body = (await response.json()) as { summary?: string | null };
  return trimmedOrNull(body.summary);
}

export async function ensureReviewFocusSummaries(
  rows: ReviewFocusSummaryInput[],
): Promise<Map<string, string | null>> {
  const summaryByReviewId = new Map<string, string | null>();
  const uniqueRows = Array.from(
    new Map(rows.map((row) => [row.id, row] as const)).values(),
  );
  const rowsNeedingSummary = uniqueRows.filter((row) => {
    const focus = trimmedOrNull(row.reviewFocus);
    if (!focus) return false;
    const existingSummary = trimmedOrNull(row.existingSummary);
    const existingSource = trimmedOrNull(row.existingSource);
    if (existingSummary && existingSource === focus) {
      summaryByReviewId.set(row.id, existingSummary);
      return false;
    }
    return true;
  });

  for (const row of uniqueRows) {
    if (!summaryByReviewId.has(row.id)) {
      summaryByReviewId.set(row.id, trimmedOrNull(row.reviewFocus));
    }
  }

  if (rowsNeedingSummary.length === 0) {
    return summaryByReviewId;
  }

  await Promise.all(
    rowsNeedingSummary.map(async (row) => {
      const reviewFocus = trimmedOrNull(row.reviewFocus);
      if (!reviewFocus) return;
      try {
        const summary = await requestReviewFocusSummary({
          reviewId: row.id,
          reviewFocus,
        });
        if (!summary) return;
        summaryByReviewId.set(row.id, summary);
      } catch (error) {
        console.error("[reviewFocusSummary] Failed to summarise review focus", {
          reviewId: row.id,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }),
  );

  return summaryByReviewId;
}
