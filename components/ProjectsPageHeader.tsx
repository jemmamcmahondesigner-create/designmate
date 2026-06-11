"use client";

import { Button, PageHeader } from "@/components/ui/ds";
import { useCreateProjectModal } from "@/components/projects/CreateProjectModalProvider";

export function ProjectsPageHeader() {
  const createProject = useCreateProjectModal();

  return (
    <PageHeader
      variant="search"
      searchPlaceholder="Filter by project, group, or teammate..."
      primaryActionSlot={
        <Button
          type="button"
          variant="primary"
          size="sm"
          label="New Project"
          icon="leading"
          iconName="plus"
          onClick={() => createProject?.openCreateProject()}
        />
      }
    />
  );
}
