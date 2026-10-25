type FeedbackRowIdentity = {
  id?: string | null;
  created_at?: string | null;
};

function createdAtMillis(row: FeedbackRowIdentity): number {
  const parsed = new Date(String(row.created_at ?? 0)).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Newest `created_at` first. Equal timestamps break toward the greater id. */
export function compareFeedbackRowsByCreatedAt(
  a: FeedbackRowIdentity,
  b: FeedbackRowIdentity,
): number {
  const createdDelta = createdAtMillis(b) - createdAtMillis(a);
  if (createdDelta !== 0) return createdDelta;
  return String(b.id ?? "").localeCompare(String(a.id ?? ""));
}

export function pickLatestFeedbackRow<T extends FeedbackRowIdentity>(
  rows: readonly T[],
): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort(compareFeedbackRowsByCreatedAt)[0] ?? null;
}
