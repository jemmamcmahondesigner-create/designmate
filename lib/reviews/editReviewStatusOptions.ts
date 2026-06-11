import {
  COMPLETABLE_STATUSES,
  normalizeReviewStatusKey,
  resolveReviewStatusPill,
  STATUS_DISPLAY_LABELS,
} from "@/lib/reviews/reviewStatusDisplay";

export type EditReviewStatusOption = { value: string; label: string };

function isCompletableStatus(statusKey: string): boolean {
  if (statusKey === "changes-needed") return true;
  return (COMPLETABLE_STATUSES as readonly string[]).includes(statusKey);
}

/** Status values available in the Edit Review drawer. */
export function editReviewStatusOptions(currentStatus: string): EditReviewStatusOption[] {
  const normalized = normalizeEditReviewStatus(currentStatus);

  if (normalized === "paused") {
    return [
      { value: "paused", label: STATUS_DISPLAY_LABELS.paused },
      { value: "in-review", label: STATUS_DISPLAY_LABELS["in-review"] },
    ];
  }

  if (normalized === "complete") {
    return [{ value: "complete", label: STATUS_DISPLAY_LABELS.complete }];
  }

  const currentLabel =
    STATUS_DISPLAY_LABELS[normalized] ??
    resolveReviewStatusPill({ status: normalized }).label;

  if (isCompletableStatus(normalized)) {
    return [
      { value: normalized, label: currentLabel },
      { value: "paused", label: STATUS_DISPLAY_LABELS.paused },
      { value: "complete", label: STATUS_DISPLAY_LABELS.complete },
    ];
  }

  return [
    { value: normalized, label: currentLabel },
    { value: "paused", label: STATUS_DISPLAY_LABELS.paused },
  ];
}

export function normalizeEditReviewStatus(value: string | null | undefined): string {
  return normalizeReviewStatusKey(value);
}

export function isEditReviewStatusSelectDisabled(status: string | null | undefined): boolean {
  return normalizeEditReviewStatus(status) === "complete";
}
