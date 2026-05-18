"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Button, ReviewCard, Tooltip } from "@/components/ui/ds";
import { useNewReviewDrawer } from "@/components/NewReviewDrawerProvider";
import type {
  ProjectContributor,
  ProjectProblem,
  ProjectReference,
  ProjectStatus
} from "@/types/project";
import type { ReviewCardData, ReviewDbStatus } from "@/types/review";
import type { User } from "@/types/user";
import { ProjectDescriptionField } from "@/components/project-detail/ProjectDescriptionField";
import { ProjectDetailHeader } from "@/components/project-detail/ProjectDetailHeader";
import { ProblemsSection } from "@/components/project-detail/ProblemsSection";
import { ContributorsSection } from "@/components/project-detail/ContributorsSection";
import { ReferencesSection } from "@/components/project-detail/ReferencesSection";
import { SidebarDetailCollapsible } from "@/components/SidebarDetailCollapsible";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "@/lib/formatDistanceToNow";
import { reviewRowHasRecordedDecision } from "@/lib/reviews/fetchProjectReviews";
import { canEditReviewDetails } from "@/lib/reviews/workflow";
import { TimelineTab } from "@/app/projects/[projectId]/TimelineTab";
import { ArtifactsTab } from "@/components/project-detail/ArtifactsTab";
import type { ProjectArtifactsTabPayload } from "@/lib/projects/loadProjectArtifactsTab";

const sectionHeadingClass =
  "text-[20px] font-semibold leading-[1.3] text-[#6b1e2e]";

const sectionHeadingStyle = { letterSpacing: "-0.3px" as const };

function parseStatus(s: string): ReviewDbStatus {
  const v = s.trim().toLowerCase();
  const allowed: ReviewDbStatus[] = [
    "draft",
    "in-review",
    "feedback-submitted",
    "paused",
    "complete",
    "approved",
    "needs-changes",
    "changes-needed",
    "blocked"
  ];
  if (allowed.includes(v as ReviewDbStatus)) return v as ReviewDbStatus;
  return "in-review";
}

function contributorsToTeammateUsers(rows: ProjectContributor[]): User[] {
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    avatarUrl: c.avatarUrl ?? null
  }));
}

function FixedSuccessToastPortal({
  message,
  onDone
}: {
  message: string;
  onDone: () => void;
}) {
  const [opacity, setOpacity] = useState(0);
  const [transition, setTransition] = useState("opacity 200ms ease");
  const [mounted, setMounted] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => setOpacity(1));
    });
    const startFadeOut = window.setTimeout(() => {
      setTransition("opacity 500ms ease");
      setOpacity(0);
    }, 3500);
    const remove = window.setTimeout(() => {
      onDoneRef.current();
    }, 4000);
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      window.clearTimeout(startFadeOut);
      window.clearTimeout(remove);
    };
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-50"
      style={{
        bottom: 24,
        left: 24,
        backgroundColor: "#ebf6ee",
        border: "1px solid #7dc98f",
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: 13,
        fontWeight: 500,
        color: "#256b38",
        boxShadow: "0px 4px 12px rgba(41,33,28,0.12)",
        opacity,
        transition,
        maxWidth: 360
      }}
      role="status"
    >
      {message}
    </div>,
    document.body
  );
}

export type ProjectDetailTab = "overview" | "timeline" | "artifacts";

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
  artifactsTabData?: ProjectArtifactsTabPayload | null;
};

export function ProjectDetailView({
  project,
  recentProjects,
  initialProblems,
  initialContributors,
  initialReferences,
  initialReviews,
  activeTab = "overview",
  artifactsTabData = null
}: ProjectDetailViewProps) {
  const { openNewReview } = useNewReviewDrawer();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [reviews, setReviews] = useState<ReviewCardData[]>(initialReviews);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [currentContributorRole, setCurrentContributorRole] = useState<string | null>(null);
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

  const fetchReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from("reviews")
      .select(
        "id, title, status, created_at, owner_display_name, review_focus, artifacts, review_type, decision_status, decision_comments, decision_selected_artifact_ids, decision_text, require_decision_maker, artifact_file_name, artifact_file_type, artifact_name, artifact_iteration, artifact_description, artifact_file_url"
      )
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });
    if (error || !data) return;
    const reviewIds = data
      .map((row) => String((row as Record<string, unknown>).id ?? ""))
      .filter(Boolean);
    const commentCountsByReviewId = new Map<string, number>();
    if (reviewIds.length > 0) {
      const { data: feedbackRows } = await supabase
        .from("reviewer_feedback")
        .select("review_id")
        .eq("feedback_status", "submitted")
        .in("review_id", reviewIds);
      for (const feedbackRow of feedbackRows ?? []) {
        const reviewId = String((feedbackRow as Record<string, unknown>).review_id ?? "");
        if (!reviewId) continue;
        commentCountsByReviewId.set(reviewId, (commentCountsByReviewId.get(reviewId) ?? 0) + 1);
      }
    }
    const mapped: ReviewCardData[] = data.map((row) => {
      const r = row as Record<string, unknown>;
      const created = r.created_at ? new Date(String(r.created_at)) : new Date();
      const dateLabel = `Updated ${formatDistanceToNow(created, { addSuffix: true })}`;
      return {
        id: String(r.id ?? ""),
        title: String(r.title ?? ""),
        status: parseStatus(String(r.status ?? "")),
        decisionStatus:
          r.decision_status == null || String(r.decision_status).trim() === ""
            ? null
            : String(r.decision_status),
        requireDecisionMaker: Boolean(r.require_decision_maker),
        ownerName: String(r.owner_display_name ?? "Reviewer"),
        dateLabel,
        description: r.review_focus ? String(r.review_focus) : null,
        review_focus: r.review_focus ? String(r.review_focus) : null,
        commentCount: commentCountsByReviewId.get(String(r.id ?? "")) ?? 0,
        decisionCount: reviewRowHasRecordedDecision(r) ? 1 : 0,
        artifact_file_name: r.artifact_file_name
          ? String(r.artifact_file_name)
          : null,
        artifact_file_type:
          r.artifact_file_type === "pdf"
            ? "pdf"
            : r.artifact_file_type === "figma"
              ? "figma"
              : null,
        artifact_name: r.artifact_name ? String(r.artifact_name) : null,
        artifact_iteration: r.artifact_iteration
          ? String(r.artifact_iteration)
          : null,
        artifact_description: r.artifact_description
          ? String(r.artifact_description)
          : null,
        artifact_file_url: r.artifact_file_url ? String(r.artifact_file_url) : null
      };
    });
    setReviews(mapped);
  }, [supabase, project.id]);

  useEffect(() => {
    setReviews(initialReviews);
  }, [initialReviews]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    const channel = supabase
      .channel(`reviews-project-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reviews",
          filter: `project_id=eq.${project.id}`
        },
        () => {
          void fetchReviews();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, project.id, fetchReviews]);

  const handleNewReview = useCallback(() => {
    if (!canEditReviewDetails(currentContributorRole)) return;
    openNewReview({
      mode: "project",
      projectId: project.id,
      projectProblems: reviewSeed.projectProblems,
      teammateOptions: reviewSeed.teammateOptions,
      onReviewCreated: () => {
        setSuccessToast("Review created successfully");
      }
    });
  }, [currentContributorRole, openNewReview, project.id, reviewSeed]);

  useEffect(() => {
    const contributorId =
      typeof window !== "undefined"
        ? window.localStorage.getItem("designtrace_dev_contributor_id")
        : null;
    if (!contributorId) {
      setCurrentContributorRole(null);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    void supabase
      .from("contributors")
      .select("role")
      .eq("id", contributorId)
      .maybeSingle()
      .then(({ data }) => {
        const role = data == null ? null : String((data as Record<string, unknown>).role ?? "");
        setCurrentContributorRole(role && role.trim() ? role : null);
      });
  }, []);
  const canCreateReview = canEditReviewDetails(currentContributorRole);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        width: "100%",
        maxWidth: "100%",
        height: "100vh",
        overflow: "hidden",
        minWidth: 0,
        flex: 1,
        backgroundColor: "#faf8f6"
      }}
    >
      <div
        className="shrink-0 self-start"
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <SidebarDetailCollapsible
          projectName={project.name}
          clientName={project.client ?? "Internal Project"}
          recentProjects={recentProjects}
        />
      </div>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          height: "100%",
          backgroundColor: "#faf8f6"
        }}
      >
        <ProjectDetailHeader
          projectId={project.id}
          projectName={project.name}
          clientLabel={clientLabel}
          initialStatus={project.status}
          reviewSeed={reviewSeed}
        />

        {/* Scroll columns; maxHeight ties to viewport minus header token (see PageHeader). */}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden"
          style={{
            display: "flex",
            flexDirection: "row",
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
            height: "100%",
            maxHeight: "calc(100vh - 48px)",
          }}
        >
          <div
            className="min-h-0 min-w-0 flex-1 overflow-y-auto pl-8 py-8"
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              overflowY: "auto",
              height: "100%",
            }}
          >
            {activeTab === "overview" ? (
              <div
                className="flex w-full min-w-0 flex-col pr-8"
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
            {activeTab === "timeline" ? (
              <div className="flex w-full min-w-0 flex-col pr-8">
                <TimelineTab projectId={project.id} />
              </div>
            ) : null}
            {activeTab === "artifacts" ? (
              <div className="flex w-full min-w-0 flex-col pr-8">
                <ArtifactsTab
                  data={
                    artifactsTabData ?? {
                      overview: [],
                      historyByArtifactId: {},
                    }
                  }
                  onNewReview={handleNewReview}
                />
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
              minHeight: 0,
              height: "100%",
              maxHeight: "100%",
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
              className="min-h-0 flex-1 px-6 pb-8"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                height: "100%",
              }}
            >
              {reviews.length === 0 ? (
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
                  {canCreateReview ? (
                    <Button
                      type="button"
                      variant="secondary"
                      label="Review"
                      icon="leading"
                      iconName="plus"
                      size="sm"
                      onClick={handleNewReview}
                    />
                  ) : (
                    <Tooltip label="You do not have permission to create a review">
                      <span style={{ display: "inline-flex" }}>
                        <Button
                          type="button"
                          variant="secondary"
                          label="Review"
                          icon="leading"
                          iconName="plus"
                          size="sm"
                          disabled
                          aria-disabled
                        />
                      </span>
                    </Tooltip>
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col" style={{ gap: 12 }}>
                  <div className="flex flex-col" style={{ gap: 4 }}>
                    {reviews.map((r) => {
                      const card = (
                        <ReviewCard
                          title={r.title}
                          status={r.status}
                          decisionStatus={r.decisionStatus}
                          requireDecisionMaker={r.requireDecisionMaker}
                          ownerName={r.ownerName}
                          dateLabel={r.dateLabel}
                          showDescription={false}
                          hasArtifact={false}
                          showDetailCounts={true}
                          commentCount={r.commentCount ?? 0}
                          decisionCount={r.decisionCount ?? 0}
                          iterationLabel={r.artifact_iteration ?? undefined}
                        />
                      );

                      if (!r.id) {
                        return (
                          <div key={r.title}>{card}</div>
                        );
                      }

                      return (
                        <Link
                          key={r.id}
                          href={`/reviews/${r.id}`}
                          className="block rounded-lg no-underline text-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                          style={{ color: "inherit" }}
                        >
                          {card}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
      {successToast ? (
        <FixedSuccessToastPortal
          key={successToast}
          message={successToast}
          onDone={() => setSuccessToast(null)}
        />
      ) : null}
    </div>
  );
}
