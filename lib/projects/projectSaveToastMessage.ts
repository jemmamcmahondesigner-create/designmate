import type { ProjectStatus } from "@/types/project";

export function getProjectSaveToastMessage({
  previousStatus,
  nextStatus,
}: {
  previousStatus: ProjectStatus;
  nextStatus: ProjectStatus;
  fieldsChanged?: boolean;
}): string {
  if (previousStatus !== nextStatus) {
    if (nextStatus === "complete") return "Project marked as complete";
    if (nextStatus === "active" && previousStatus === "complete") {
      return "Project reactivated";
    }
    if (nextStatus === "paused") return "Project paused";
  }

  return "Project updated";
}
