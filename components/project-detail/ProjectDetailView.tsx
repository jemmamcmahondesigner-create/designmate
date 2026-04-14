"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/ds";
import { useNewReviewDrawer } from "@/components/NewReviewDrawerProvider";
import type {
  ProjectContributor,
  ProjectProblem,
  ProjectReference,
  ProjectStatus
} from "@/types/project";
import type { User } from "@/types/user";
import { ProjectDescriptionField } from "@/components/project-detail/ProjectDescriptionField";
import { ProjectDetailHeader } from "@/components/project-detail/ProjectDetailHeader";
import { ReviewCard, type ReviewCardData } from "@/components/project-detail/ReviewCard";
import { ProblemsSection } from "@/components/project-detail/ProblemsSection";
import { ContributorsSection } from "@/components/project-detail/ContributorsSection";
import { ReferencesSection } from "@/components/project-detail/ReferencesSection";
import { SidebarDetailCollapsible } from "@/components/SidebarDetailCollapsible";

const sectionHeadingClass =
  "text-[20px] font-semibold leading-[1.3] text-[#6b1e2e]";

const sectionHeadingStyle = { letterSpacing: "-0.3px" as const };

function contributorsToTeammateUsers(rows: ProjectContributor[]): User[] {
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email
  }));
}

export type ProjectDetailTab = "overview" | "iterations" | "timeline";

export type ProjectDetailViewProps = {
  project: {
    id: string;
    name: string;
    client: string | null;
    description: string | null;
    status: ProjectStatus;
  };
  recentProjects: {
    id: string;
    name: string;
    client: string | null;
  }[];
  initialProblems: ProjectProblem[];
  initialContributors: ProjectContributor[];
  initialReferences: ProjectReference[];
  initialReviews: ReviewCardData[];
  activeTab?: ProjectDetailTab;
};

/** Overview / Iterations / Timeline — routes, active state via pathname (spec §4). */
function ProjectDetailTabBar({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const tabOverview = pathname === base;
  const tabIterations = pathname === `${base}/iterations`;
  const tabTimeline = pathname === `${base}/timeline`;

  const pad = { padding: "8px 12px" as const };
  const type = {
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.5,
    letterSpacing: "0.26px" as const
  };

  return (
    <div
      role="tablist"
      aria-label="Project sections"
      className="flex shrink-0 flex-row items-center bg-white"
      style={{
        height: 48,
        boxSizing: "border-box",
        padding: 6,
        gap: 6,
        borderBottom: "1px solid #ede8e0"
      }}
    >
      <Link
        href={base}
        role="tab"
        aria-selected={tabOverview}
        className={
          tabOverview
            ? "inline-flex items-center justify-center rounded-[6px] border-0 bg-[#f5eaec] text-[13px] font-medium leading-[1.5] text-[#6b1e2e] no-underline outline-none"
            : "inline-flex items-center justify-center rounded-[6px] border-0 bg-transparent text-[13px] font-medium leading-[1.5] text-[#6b5e55] no-underline outline-none transition-colors duration-150 ease-in-out hover:bg-[#f3efe9]"
        }
        style={{ ...pad, ...type }}
      >
        Overview
      </Link>
      <Link
        href={`${base}/iterations`}
        role="tab"
        aria-selected={tabIterations}
        className={
          tabIterations
            ? "inline-flex items-center justify-center rounded-[6px] border-0 bg-[#f5eaec] text-[13px] font-medium leading-[1.5] text-[#6b1e2e] no-underline outline-none"
            : "inline-flex items-center justify-center rounded-[6px] border-0 bg-transparent text-[13px] font-medium leading-[1.5] text-[#6b5e55] no-underline outline-none transition-colors duration-150 ease-in-out hover:bg-[#f3efe9]"
        }
        style={{ ...pad, ...type }}
      >
        Iterations
      </Link>
      <Link
        href={`${base}/timeline`}
        role="tab"
        aria-selected={tabTimeline}
        className={
          tabTimeline
            ? "inline-flex items-center justify-center rounded-[6px] border-0 bg-[#f5eaec] text-[13px] font-medium leading-[1.5] text-[#6b1e2e] no-underline outline-none"
            : "inline-flex items-center justify-center rounded-[6px] border-0 bg-transparent text-[13px] font-medium leading-[1.5] text-[#6b5e55] no-underline outline-none transition-colors duration-150 ease-in-out hover:bg-[#f3efe9]"
        }
        style={{ ...pad, ...type }}
      >
        Timeline
      </Link>
    </div>
  );
}

function IterationsEmptyState({ onNewReview }: { onNewReview: () => void }) {
  return (
    <div
      className="flex w-full min-h-0 flex-1 flex-col items-center justify-center text-center"
      style={{
        backgroundColor: "#f3efe9",
        border: "1px solid #e4ddd3",
        borderRadius: 8,
        flex: "1 1 auto",
        width: "100%",
        minHeight: 0,
        padding: 32,
        gap: 16
      }}
    >
      <p
        className="m-0 max-w-lg text-[14px] font-medium leading-[1.5]"
        style={{ color: "#998c82" }}
      >
        Iterations will appear here as you add versioned artifacts to reviews.
      </p>
      <Button
        type="button"
        variant="secondary"
        label="New Review"
        icon="leading"
        iconName="plus"
        size="sm"
        onClick={onNewReview}
      />
    </div>
  );
}

function TimelineEmptyState({ onNewReview }: { onNewReview: () => void }) {
  return (
    <div
      className="flex w-full min-h-0 flex-1 flex-col items-center justify-center text-center"
      style={{
        backgroundColor: "#f3efe9",
        border: "1px solid #e4ddd3",
        borderRadius: 8,
        flex: "1 1 auto",
        width: "100%",
        minHeight: 0,
        padding: 32,
        gap: 16
      }}
    >
      <p
        className="m-0 max-w-lg text-[14px] font-medium leading-[1.5]"
        style={{ color: "#998c82" }}
      >
        Decisions and key events will appear here as your project progresses.
      </p>
      <Button
        type="button"
        variant="secondary"
        label="New Review"
        icon="leading"
        iconName="plus"
        size="sm"
        onClick={onNewReview}
      />
    </div>
  );
}

export function ProjectDetailView({
  project,
  recentProjects,
  initialProblems,
  initialContributors,
  initialReferences,
  initialReviews,
  activeTab = "overview"
}: ProjectDetailViewProps) {
  const { openNewReview } = useNewReviewDrawer();

  const clientLabel = project.client?.trim() || "Unassigned";
  const descriptionText = project.description?.trim() ?? "";
  const descriptionPlaceholder =
    "Add a short overview of goals, scope, and success criteria…";

  const reviewSeed = useMemo(
    () => ({
      projectProblems: initialProblems,
      teammateOptions: contributorsToTeammateUsers(initialContributors)
    }),
    [initialProblems, initialContributors]
  );

  const handleNewReview = useCallback(() => {
    openNewReview({
      mode: "project",
      projectId: project.id,
      projectProblems: reviewSeed.projectProblems,
      teammateOptions: reviewSeed.teammateOptions
    });
  }, [openNewReview, project.id, reviewSeed]);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        minWidth: 0,
        flex: 1,
        backgroundColor: "#faf8f6"
      }}
    >
      <SidebarDetailCollapsible
        projectName={project.name}
        clientName={project.client ?? "Internal Project"}
        recentProjects={recentProjects}
      />
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{ display: "flex", flex: 1, minWidth: 0, backgroundColor: "#faf8f6" }}
      >
        <ProjectDetailHeader
          projectId={project.id}
          projectName={project.name}
          clientLabel={clientLabel}
          initialStatus={project.status}
          reviewSeed={reviewSeed}
        />
        <ProjectDetailTabBar projectId={project.id} />

        <div
          className="min-h-0 flex-1"
          style={{
            display: "flex",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            alignItems: "stretch"
          }}
        >
          <div
            className="min-h-0 flex-1"
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              paddingLeft: 32,
              paddingTop: 32,
              paddingBottom: 32,
              paddingRight: 32,
              overflow: "hidden"
            }}
          >
            {activeTab === "overview" ? (
              <div
                className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto"
                style={{ gap: 32 }}
              >
                <section>
                  <h2 className={sectionHeadingClass} style={sectionHeadingStyle}>
                    Project Description
                  </h2>
                  <div className="mt-3">
                    <ProjectDescriptionField
                      projectId={project.id}
                      initialValue={descriptionText}
                      placeholder={descriptionPlaceholder}
                    />
                  </div>
                </section>

                <ProblemsSection
                  projectId={project.id}
                  initialProblems={initialProblems}
                />

                <ContributorsSection
                  projectId={project.id}
                  initialContributors={initialContributors}
                />

                <ReferencesSection
                  projectId={project.id}
                  initialReferences={initialReferences}
                />
              </div>
            ) : null}
            {activeTab === "iterations" ? (
              <div
                className="flex min-h-0 flex-1 flex-col"
                style={{ flex: "1 1 auto", minHeight: 0 }}
              >
                <IterationsEmptyState onNewReview={handleNewReview} />
              </div>
            ) : null}
            {activeTab === "timeline" ? (
              <div
                className="flex min-h-0 flex-1 flex-col"
                style={{ flex: "1 1 auto", minHeight: 0 }}
              >
                <TimelineEmptyState onNewReview={handleNewReview} />
              </div>
            ) : null}
          </div>

          <aside
            className="hidden min-h-0 flex-col bg-white lg:flex lg:w-[360px] xl:w-[440px]"
            style={{
              alignSelf: "stretch",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              borderLeft: "1px solid #e6dbd8",
              overflow: "hidden",
              padding: 0,
              minHeight: 0
            }}
          >
            <h2
              className={`${sectionHeadingClass} shrink-0`}
              style={{
                ...sectionHeadingStyle,
                padding: "24px 24px 16px 24px"
              }}
            >
              Reviews
            </h2>
            <div
              className="flex min-h-0 flex-1 flex-col"
              style={{ padding: "0 24px 24px 24px", flex: "1 1 auto" }}
            >
              {initialReviews.length === 0 ? (
                <div
                  className="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
                  style={{
                    flex: "1 1 auto",
                    minHeight: 0,
                    gap: 12,
                    padding: 32,
                    backgroundColor: "#f3efe9",
                    border: "1px solid #e4ddd3",
                    borderRadius: 8
                  }}
                >
                  <p
                    className="m-0 text-[12px] font-normal leading-[1.5]"
                    style={{ color: "#998c82", letterSpacing: "0.24px" }}
                  >
                    No reviews yet. Create a review to start capturing design
                    decisions.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    label="New Review"
                    icon="leading"
                    iconName="plus"
                    size="sm"
                    onClick={handleNewReview}
                  />
                </div>
              ) : (
                <div className="flex flex-col" style={{ gap: 4 }}>
                  {initialReviews.map((r) => (
                    <ReviewCard key={r.id ?? r.title} data={r} />
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
