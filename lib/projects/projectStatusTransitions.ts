import type { ProjectStatus } from "@/types/project";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  complete: "Complete",
};

export function getProjectStatusMenuOptions(
  current: ProjectStatus,
): Array<{ value: ProjectStatus; label: string }> {
  switch (current) {
    case "active":
      return [
        { value: "paused", label: STATUS_LABELS.paused },
        { value: "complete", label: STATUS_LABELS.complete },
      ];
    case "paused":
      return [
        { value: "active", label: STATUS_LABELS.active },
        { value: "complete", label: STATUS_LABELS.complete },
      ];
    case "complete":
      return [{ value: "active", label: STATUS_LABELS.active }];
    default:
      return [];
  }
}
