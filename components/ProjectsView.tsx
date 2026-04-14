"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "@/lib/phosphor";
import { Button } from "@/components/ui/ds";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { ProjectCard } from "@/components/ProjectCard";
import type { Project, ProjectsByStatus } from "@/types/project";

type AccordionSectionProps = {
  title: string;
  projects: Project[];
  reviewCounts: Record<string, number>;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  emptyMessage?: React.ReactNode;
  showEmptyPanel?: boolean;
};

function AccordionHeaderRow({
  title,
  open,
  disabled,
  onToggle
}: {
  title: string;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  let labelColor: string;
  let iconColor: string;
  if (disabled) {
    labelColor = iconColor = "#998c82";
  } else if (open) {
    labelColor = iconColor = "#6b1e2e";
  } else {
    labelColor = iconColor = "#6b5e55";
  }

  const chevronEl = open ? (
    <ChevronUp size={12} weight="fill" color={iconColor} />
  ) : (
    <ChevronDown size={12} weight="fill" color={iconColor} />
  );

  const dividerEl = disabled ? (
    <div
      className="ml-3 h-px min-w-0 flex-1"
      style={{ backgroundColor: "#e4ddd3" }}
    />
  ) : (
    <div
      className="ml-3 h-px min-w-0 flex-1"
      style={{ backgroundColor: "#c9c0b4" }}
    />
  );

  const isTrulyDisabled = disabled;

  const rowInner = (
    <>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center"
        style={{ borderRadius: 4 }}
      >
        {chevronEl}
      </span>
      <span
        className="ml-2 shrink-0 text-[18px] font-semibold leading-[1.5]"
        style={{ color: labelColor }}
      >
        {title}
      </span>
      {dividerEl}
    </>
  );

  if (isTrulyDisabled) {
    return (
      <div
        className="flex w-full cursor-default items-center"
        aria-disabled="true"
      >
        {rowInner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center border-0 bg-transparent p-0 text-left"
    >
      {rowInner}
    </button>
  );
}

function AccordionSection({
  title,
  open,
  disabled,
  onToggle,
  projects,
  reviewCounts,
  emptyMessage,
  showEmptyPanel = false
}: AccordionSectionProps) {
  return (
    <section className="w-full">
      <div className="pb-2 pt-1">
        <AccordionHeaderRow
          title={title}
          open={open}
          disabled={disabled}
          onToggle={onToggle}
        />
      </div>

      {open && showEmptyPanel && projects.length === 0 && emptyMessage ? (
        <div className="pb-6">{emptyMessage}</div>
      ) : null}

      {open && projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 pb-6 sm:grid-cols-2 lg:grid-cols-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              reviewCount={reviewCounts[p.id] ?? 0}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export type ProjectsViewProps = {
  grouped: ProjectsByStatus;
  reviewCounts: Record<string, number>;
};

export function ProjectsView({ grouped, reviewCounts }: ProjectsViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeOpen, setActiveOpen] = useState(true);
  const [pausedOpen, setPausedOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const pausedDisabled = grouped.paused.length === 0;
  const completeDisabled = grouped.complete.length === 0;

  const activeEmptyPanel = (
    <div
      className="flex w-full items-center justify-center text-center"
      style={{
        backgroundColor: "#f3efe9",
        border: "1px solid #e4ddd3",
        borderRadius: 8,
        minHeight: 160,
        padding: 32
      }}
    >
      <p
        className="max-w-md text-[14px] font-medium leading-[1.5]"
        style={{ color: "#998c82" }}
      >
        No active projects exist. Create a project to start a review.
      </p>
    </div>
  );

  return (
    <div
      className="w-full min-h-0 flex-1"
      style={{
        width: "100%",
        minHeight: 0,
        flex: "1 1 auto",
        backgroundColor: "#faf8f6"
      }}
    >
      <div
        className="w-full pb-16"
        style={{
          width: "100%",
          paddingLeft: 32,
          paddingTop: 32,
          paddingRight: 32,
          paddingBottom: 64
        }}
      >
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-4">
          <div
            className="flex min-w-0 flex-wrap items-baseline"
            style={{ gap: 24 }}
          >
            <h1
              className="text-[32px] font-extrabold leading-[1.2]"
              style={{ color: "#6b1e2e", letterSpacing: "-0.96px" }}
            >
              Projects
            </h1>
            <p
              className="max-w-xl text-[15px] font-normal leading-[1.65]"
              style={{ color: "#6b5e55" }}
            >
              These are the project folders where you can find all your reviews
              &amp; decisions.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center" style={{ gap: 12 }}>
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center border text-[13px] font-medium leading-[1.5]"
              style={{
                backgroundColor: "#e4ddd3",
                borderColor: "#ede8e0",
                color: "#c9c0b4",
                borderRadius: 6,
                padding: "6px 12px",
                letterSpacing: "0.26px"
              }}
            >
              Filter
            </button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              label="New Project"
              icon="leading"
              iconName="plus"
              onClick={() => setModalOpen(true)}
            />
          </div>
        </div>

        <div className="flex flex-col">
          <AccordionSection
            title="Active"
            projects={grouped.active}
            reviewCounts={reviewCounts}
            open={activeOpen}
            disabled={false}
            onToggle={() => setActiveOpen((v) => !v)}
            emptyMessage={activeEmptyPanel}
            showEmptyPanel
          />
          <AccordionSection
            title="Paused"
            projects={grouped.paused}
            reviewCounts={reviewCounts}
            open={pausedOpen}
            disabled={pausedDisabled}
            onToggle={() => setPausedOpen((v) => !v)}
            showEmptyPanel={false}
          />
          <AccordionSection
            title="Complete"
            projects={grouped.complete}
            reviewCounts={reviewCounts}
            open={completeOpen}
            disabled={completeDisabled}
            onToggle={() => setCompleteOpen((v) => !v)}
            showEmptyPanel={false}
          />
        </div>
      </div>

      <CreateProjectModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
