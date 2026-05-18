'use client';

import { Tag } from '@/components/ui/ds';
import type { ProjectProblem } from '@/types/project';

export type ProblemRowProps = {
  problem: ProjectProblem;
  active: boolean;
  onRemove: (id: string) => void;
};

export function ProblemRow({ problem, active, onRemove }: ProblemRowProps) {
  if (active) {
    return (
      <Tag
        label={problem.description}
        variant="brand"
        size="md"
        icon="removable"
        onRemove={() => onRemove(problem.id)}
        className="w-full"
      />
    );
  }
  return (
    <Tag
      label={problem.description}
      variant="default"
      size="md"
      className="flex-1 w-full"
    />
  );
}
