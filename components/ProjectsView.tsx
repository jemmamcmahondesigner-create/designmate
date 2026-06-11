"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "@/lib/phosphor";
import {
  Button,
  Divider,
  NotificationBadge,
  PageHeader,
  ProductCard,
  Tooltip,
  type StatusPillStatus
} from "@/components/ui/ds";
import { useNewReviewDrawer } from "@/components/NewReviewDrawerProvider";
import { useCreateProjectModal } from "@/components/projects/CreateProjectModalProvider";
import { useActiveWorkspacePermission } from "@/hooks/useWorkspacePermission";
import { canCreateReviews, CREATE_REVIEW_DENIED_TOOLTIP } from "@/lib/workspace/permissions";
import type { Project, ProjectStatus, ProjectsByStatus } from "@/types/project";

function projectStatusPresentation(status: ProjectStatus): {
  label: string;
  variant: StatusPillStatus;
} {
  switch (status) {
    case "active":
      return { label: "Active", variant: "approved" };
    case "paused":
      return { label: "Paused", variant: "draft" };
    case "complete":
      return { label: "Complete", variant: "closed" };
    default:
      return { label: "Paused", variant: "draft" };
  }
}

type AccordionSectionProps = {
  title: string;
  projects: Project[];
  reviewCounts: Record<string, number>;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  emptyMessage?: ReactNode;
  showEmptyPanel?: boolean;
};

function AccordionHeaderRow({
  title,
  count,
  open,
  disabled,
  onToggle
}: {
  title: string;
  count: number;
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

  const dividerEl = <Divider className="ml-3 min-w-0 flex-1" />;

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
      <span className="ml-3 inline-flex shrink-0 items-center self-center">
        <NotificationBadge
          count={count}
          sentiment="brand"
          prominence={open ? "high" : "low"}
        />
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
          count={projects.length}
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
          {projects.map((p) => {
            const meta = projectStatusPresentation(p.status);
            return (
              <ProductCard
                key={p.id}
                title={p.name}
                statusLabel={meta.label}
                statusVariant={meta.variant}
                reviewCount={reviewCounts[p.id] ?? 0}
                decisionCount={0}
                description={p.description ?? undefined}
                tagLabel={p.client ?? undefined}
                contributors={[]}
                href={`/projects/${p.id}`}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export type ProjectsViewProps = {
  grouped: ProjectsByStatus;
  reviewCounts: Record<string, number>;
  searchPlaceholder: string;
  workspaceEmptyMessage?: string;
};

export function ProjectsView({
  grouped,
  reviewCounts,
  searchPlaceholder,
  workspaceEmptyMessage,
}: ProjectsViewProps) {
  const createProject = useCreateProjectModal();
  const { openNewReview } = useNewReviewDrawer();
  const [searchQuery, setSearchQuery] = useState("");
  const { permissionLevel } = useActiveWorkspacePermission();
  const canCreateReview = canCreateReviews(permissionLevel);

  const handleNewReview = () => {
    openNewReview({ mode: "global" });
  };
  const [activeOpen, setActiveOpen] = useState(true);
  const [pausedOpen, setPausedOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const filteredGrouped = useMemo((): ProjectsByStatus => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return grouped;
    const filt = (arr: Project[]) =>
      arr.filter((p) => {
        const team = (p.contributor_names ?? []).join("\0").toLowerCase();
        const hay = [p.name, p.description ?? "", team].join("\0").toLowerCase();
        return hay.includes(q);
      });
    return {
      active: filt(grouped.active),
      paused: filt(grouped.paused),
      complete: filt(grouped.complete)
    };
  }, [grouped, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim() !== "") return;
    setActiveOpen(true);
    setPausedOpen(false);
    setCompleteOpen(false);
  }, [searchQuery]);

  const hasSearch = searchQuery.trim() !== "";

  const pausedDisabled = !hasSearch && grouped.paused.length === 0;
  const completeDisabled = !hasSearch && grouped.complete.length === 0;

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
        {workspaceEmptyMessage ??
          "No active projects exist. Create a project to start a review."}
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
      <PageHeader
        variant="search"
        searchPlaceholder={searchPlaceholder}
        searchValue={searchQuery}
        onSearch={setSearchQuery}
        primaryActionSlot={
          canCreateReview ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              label="Review"
              icon="leading"
              iconName="plus"
              onClick={handleNewReview}
            />
          ) : (
            <Tooltip label={CREATE_REVIEW_DENIED_TOOLTIP} position="bottom">
              <span style={{ display: "inline-flex" }}>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  label="Review"
                  icon="leading"
                  iconName="plus"
                  disabled
                  onClick={handleNewReview}
                />
              </span>
            </Tooltip>
          )
        }
      />

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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              label="New Project"
              icon="leading"
              iconName="plus"
              onClick={() => createProject?.openCreateProject()}
            />
          </div>
        </div>

        <div className="flex flex-col">
          {(!hasSearch || filteredGrouped.active.length > 0) && (
            <AccordionSection
              title="Active"
              projects={filteredGrouped.active}
              reviewCounts={reviewCounts}
              open={activeOpen}
              disabled={false}
              onToggle={() => setActiveOpen((v) => !v)}
              emptyMessage={activeEmptyPanel}
              showEmptyPanel
            />
          )}
          {(!hasSearch || filteredGrouped.paused.length > 0) && (
            <AccordionSection
              title="Paused"
              projects={filteredGrouped.paused}
              reviewCounts={reviewCounts}
              open={pausedOpen}
              disabled={pausedDisabled}
              onToggle={() => setPausedOpen((v) => !v)}
              showEmptyPanel={false}
            />
          )}
          {(!hasSearch || filteredGrouped.complete.length > 0) && (
            <AccordionSection
              title="Complete"
              projects={filteredGrouped.complete}
              reviewCounts={reviewCounts}
              open={completeOpen}
              disabled={completeDisabled}
              onToggle={() => setCompleteOpen((v) => !v)}
              showEmptyPanel={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
