export function formatAccessRequestSentTooltip(
  recipientName: string | null,
  createdAtIso: string | null,
): string {
  const name = recipientName?.trim();
  if (!createdAtIso?.trim()) {
    return name ? `Request sent to ${name}` : "Request sent";
  }

  const date = new Date(createdAtIso);
  const dateLabel = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

  if (name && dateLabel) {
    return `Request sent to ${name} · ${dateLabel}`;
  }
  if (name) return `Request sent to ${name}`;
  if (dateLabel) return `Request sent · ${dateLabel}`;
  return "Request sent";
}
