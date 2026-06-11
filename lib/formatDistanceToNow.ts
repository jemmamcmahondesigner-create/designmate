/**
 * Lightweight relative time (no date-fns dependency).
 * Past dates only; mirrors `formatDistanceToNow(..., { addSuffix: true })` style.
 */
export function formatDistanceToNow(
  date: Date,
  opts?: { addSuffix?: boolean }
): string {
  const addSuffix = opts?.addSuffix ?? true;
  const diffMs = Date.now() - date.getTime();
  const past = diffMs >= 0;
  const absSec = Math.floor(Math.abs(diffMs) / 1000);

  let text: string;
  if (absSec < 45) text = past ? "just now" : "in a few seconds";
  else if (absSec < 90) text = past ? "1 minute ago" : "in 1 minute";
  else if (absSec < 3600) {
    const m = Math.floor(absSec / 60);
    text = past ? `${m} minutes ago` : `in ${m} minutes`;
  } else if (absSec < 86400) {
    const h = Math.floor(absSec / 3600);
    text = past
      ? `${h} ${h === 1 ? "hour" : "hours"} ago`
      : `in ${h} ${h === 1 ? "hour" : "hours"}`;
  } else {
    const now = new Date();
    const sameYear = now.getFullYear() === date.getFullYear();
    text = sameYear
      ? date.toLocaleDateString([], { month: "short", day: "numeric" })
      : date.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
    return text;
  }

  if (!addSuffix) return text.replace(/\sago$/, "").replace(/^in\s/, "");
  return text;
}

/**
 * Abbreviated relative time for compact card headers (avoids line wrapping):
 *   < 1 min   → "just now"
 *   1–59 min  → "Xm ago"
 *   1–23 hr   → "Xh ago"
 *   1–6 days  → "Xd ago"
 *   7+ days   → short date ("Jun 1", with year if different)
 */
export function formatDistanceToNowShort(
  date: Date | null | undefined,
): string {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const absSec = Math.floor(Math.abs(diffMs) / 1000);

  if (absSec < 60) return "just now";

  const minutes = Math.floor(absSec / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const now = new Date();
  const sameYear = now.getFullYear() === date.getFullYear();
  return sameYear
    ? date.toLocaleDateString([], { month: "short", day: "numeric" })
    : date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
