import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";

const SNAPSHOT_STATUSES = new Set([
  "approved",
  "direction-approved",
  "complete",
]);

function getAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000"
  ).replace(/\/$/, "");
}

async function readCookieHeader(): Promise<string> {
  try {
    const store = await cookies();
    return store
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  } catch (err) {
    console.error(
      "[triggerFigmaSnapshotsForReview] cookies unavailable:",
      err,
    );
    return "";
  }
}

async function captureFigmaSnapshots(
  reviewId: string,
  cookieHeader: string,
): Promise<void> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("artifact_versions")
    .select("artifact_id, link_url")
    .eq("review_id", reviewId)
    .ilike("link_url", "%figma.com%");

  if (error) {
    console.error("[triggerFigmaSnapshotsForReview] query failed:", error);
    return;
  }

  const artifactIds = [
    ...new Set(
      (data ?? [])
        .map((row) =>
          String((row as { artifact_id?: string | null }).artifact_id ?? "").trim(),
        )
        .filter(Boolean),
    ),
  ];

  if (artifactIds.length === 0) return;

  const origin = getAppOrigin();

  for (const artifactId of artifactIds) {
    try {
      void fetch(`${origin}/api/artifacts/${artifactId}/snapshot`, {
        method: "POST",
        headers: cookieHeader ? { cookie: cookieHeader } : {},
      }).catch((err) => {
        console.error(
          `[triggerFigmaSnapshotsForReview] snapshot fetch failed for ${artifactId}:`,
          err,
        );
      });
    } catch (err) {
      console.error(
        `[triggerFigmaSnapshotsForReview] snapshot trigger failed for ${artifactId}:`,
        err,
      );
    }
  }
}

/**
 * Schedules Figma snapshot capture after a resolved review status write.
 * Awaits only cookie capture (request context); snapshot work is fire-and-forget.
 */
export async function triggerFigmaSnapshotsForReview(
  reviewId: string,
  newStatus: string,
): Promise<void> {
  const status = String(newStatus ?? "")
    .trim()
    .toLowerCase();
  if (!SNAPSHOT_STATUSES.has(status)) return;

  const id = String(reviewId ?? "").trim();
  if (!id) return;

  const cookieHeader = await readCookieHeader();
  void captureFigmaSnapshots(id, cookieHeader).catch((err) => {
    console.error("[triggerFigmaSnapshotsForReview] unexpected error:", err);
  });
}
