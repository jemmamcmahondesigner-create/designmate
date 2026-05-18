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
    const d = Math.floor(absSec / 86400);
    text = past
      ? `${d} ${d === 1 ? "day" : "days"} ago`
      : `in ${d} ${d === 1 ? "day" : "days"}`;
  }

  if (!addSuffix) return text.replace(/\sago$/, "").replace(/^in\s/, "");
  return text;
}
