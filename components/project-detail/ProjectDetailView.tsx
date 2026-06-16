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
import { Button, NotificationBadge, ReviewCard } from "@/components/ui/ds";
import { useNewReviewDrawer } from "@/components/NewReviewDrawerProvider";
import type {
  ProjectContributor,
  ProjectProblem,
  ProjectReference,
  ProjectStatus
} from "@/types/project";
import { parseReviewDbStatus, sortReviewCardsForProjectSidebar } from "@/lib/reviews/reviewStatusDisplay";
import type { ReviewCardData, ReviewType } from "@/types/review";
import type { User } from "@/types/user";
import { ProjectDescriptionField } from "@/components/project-detail/ProjectDescriptionField";
import { ProjectDetailHeader } from "@/components/project-detail/ProjectDetailHeader";
import { ProblemsSection } from "@/components/project-detail/ProblemsSection";
import { ContributorsSection } from "@/components/project-detail/ContributorsSection";
import { ReferencesSection } from "@/components/project-detail/ReferencesSection";
import { SidebarDetailCollapsible } from "@/components/SidebarDetailCollapsible";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "@/lib/formatDistanceToNow";
import {
  buildReviewCardReviewers,
  fetchReviewCardMeta,
  resolveReviewCardCreatorId,
} from "@/lib/reviews/fetchProjectReviews";
import { resolveRequesterContributorId } from "@/lib/accessRequests/loadPendingAccessRequest";
import { readDevImpersonationContributorIdFromBrowser } from "@/lib/auth/resolveEffectiveContributor";
import { useActiveWorkspacePermission } from "@/hooks/useWorkspacePermission";
import {
  deriveIsProjectMember,
  resolveHasProjectContributorRowClient,
} from "@/lib/project-detail/resolveProjectMembershipClient";
import { loadProjectPendingAccessRequestSummary } from "@/lib/accessRequests/loadPendingAccessRequestSummaries";
import {
  canCreateReviews,
  isAssignedReviewerScope,
  normalizeWorkspacePermission,
} from "@/lib/workspace/permissions";
import { TimelineTab } from "@/app/projects/[projectId]/TimelineTab";
import { ArtifactsTab } from "@/components/project-detail/ArtifactsTab";
import type { ProjectArtifactsTabPayload } from "@/lib/projects/loadProjectArtifactsTab";
import panelEmptyStateStyles from "@/components/project-detail/projectPanelEmptyState.module.css";

const sectionHeadingClass =
  "text-[20px] font-bold leading-[1.3] text-[#6b1e2e]";

const sectionHeadingStyle = { letterSpacing: "-0.3px" as const };

const REVIEWS_RHC_CLOSED_WIDTH = 48;
const REVIEWS_RHC_STORAGE_KEY = "designtrace_project_reviews_rhc_open";
const REVIEWS_RHC_OPEN_WIDTH = "clamp(360px, 34vw, 440px)";

const reviewsRhcHeaderIconButtonStyle = {
  width: 32,
  height: 32,
  padding: 0,
  flexShrink: 0,
} as const;

function parseReviewType(raw: string | null | undefined): ReviewType {
  const s = String(raw ?? "").toLowerCase();
  if (s === "critique" || s === "align" || s === "approve") return s;
  return "compare";
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
    clientId: string | null;
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
  const reviewsScrollRef = useRef<HTMLDivElement | null>(null);
  const [isReviewsScrolled, setIsReviewsScrolled] = useState(false);
  const [reviewsRhcOpen, setReviewsRhcOpen] = useState(false);
  const [reviewsRhcHydrated, setReviewsRhcHydrated] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const {
    workspacePermissionLevel,
    reviewerType,
    userId: workspaceUserId,
    workspacePermissionLoading,
  } = useActiveWorkspacePermission();
  const [hasProjectContributorRow, setHasProjectContributorRow] = useState<
    boolean | null
  >(null);
  const [pendingAccessRequestCount, setPendingAccessRequestCount] = useState(0);
  const [pendingAccessRequesterNames, setPendingAccessRequesterNames] = useState<
    string[]
  >([]);
  const clientLabel = project.client?.trim() || "Unassigned";
  const isProjectComplete = project.status === "complete";
  const descriptionText = project.description?.trim() ?? "";
  const descriptionPlaceholder =
    "Add a short overview of goals, scope, and success criteria…";

  const sortedReviews = useMemo(
    () => sortReviewCardsForProjectSidebar(reviews),
    [reviews],
  );

  const reviewSeed = useMemo(
    () => ({
      projectProblems: initialProblems,
      teammateOptions: contributorsToTeammateUsers(initialContributors)
    }),
    [initialProblems, initialContributors]
  );

  const isProjectMember = useMemo(
    () =>
      deriveIsProjectMember(
        workspacePermissionLevel,
        hasProjectContributorRow,
        workspacePermissionLoading,
      ),
    [
      workspacePermissionLevel,
      hasProjectContributorRow,
      workspacePermissionLoading,
    ],
  );

  const reviewerContentReadOnly = useMemo(
    () =>
      normalizeWorkspacePermission(workspacePermissionLevel) === "reviewer" &&
      isProjectMember === false,
    [isProjectMember, workspacePermissionLevel],
  );

  const fieldsReadOnly = isProjectComplete || reviewerContentReadOnly;
  const hideContentActions = isProjectComplete || reviewerContentReadOnly;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const hasRow = await resolveHasProjectContributorRowClient(
        supabase,
        project.id,
        workspaceUserId,
      );
      if (cancelled) return;
      setHasProjectContributorRow(hasRow);

      const pendingSummary = await loadProjectPendingAccessRequestSummary(
        supabase,
        project.id,
      );
      if (!cancelled) {
        setPendingAccessRequestCount(pendingSummary.count);
        setPendingAccessRequesterNames(pendingSummary.requesterNames);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project.id, supabase, workspaceUserId]);

  const refreshPendingAccessRequests = useCallback(async () => {
    const pendingSummary = await loadProjectPendingAccessRequestSummary(
      supabase,
      project.id,
    );
    setPendingAccessRequestCount(pendingSummary.count);
    setPendingAccessRequesterNames(pendingSummary.requesterNames);
  }, [project.id, supabase]);

  const fetchReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from("reviews")
      .select(
        "id, title, status, created_at, owner_display_name, creator_id, review_focus, reviewer_contributor_ids, artifacts, review_type, decision_status, decision_comments, decision_selected_artifact_ids, decision_text, require_decision_maker, artifact_file_name, artifact_file_type, artifact_name, artifact_iteration, artifact_description, artifact_file_url"
      )
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });
    if (error || !data) return;

    let rows = data;
    if (isAssignedReviewerScope(workspacePermissionLevel, reviewerType)) {
      const { data: projectRow } = await supabase
        .from("projects")
        .select("workspace_id")
        .eq("id", project.id)
        .maybeSingle();
      const workspaceId = String(
        (projectRow as { workspace_id?: string | null } | null)?.workspace_id ?? "",
      ).trim();
      const contributorId = workspaceId
        ? await resolveRequesterContributorId(
            supabase,
            workspaceId,
            readDevImpersonationContributorIdFromBrowser(),
          )
        : null;
      if (!contributorId) {
        setReviews([]);
        return;
      }
      rows = data.filter((row) => {
        const ids = (row as Record<string, unknown>).reviewer_contributor_ids;
        if (!Array.isArray(ids)) return false;
        return ids.some((id) => String(id ?? "").trim() === contributorId);
      });
    }

    const reviewIds = rows
      .map((row) => String((row as Record<string, unknown>).id ?? ""))
      .filter(Boolean);
    const reviewerIds = [...new Set(
      rows.flatMap((row) =>
        Array.isArray((row as Record<string, unknown>).reviewer_contributor_ids)
          ? ((row as Record<string, unknown>).reviewer_contributor_ids as unknown[])
              .map((id) => String(id).trim())
              .filter(Boolean)
          : [],
      ),
    )];
    const creatorIds = [...new Set(
      rows
        .map((row) => String((row as Record<string, unknown>).creator_id ?? "").trim())
        .filter(Boolean),
    )];
    const { reviewerResolutionByRawId, countsByReviewId } = await fetchReviewCardMeta(supabase, {
      reviewIds,
      reviewerIds,
      creatorIds,
    });
    const mapped: ReviewCardData[] = rows.map((row) => {
      const r = row as Record<string, unknown>;
      const created = r.created_at ? new Date(String(r.created_at)) : new Date();
      const dateLabel = `Updated ${formatDistanceToNow(created, { addSuffix: true })}`;
      const reviewFocus =
        r.review_focus == null || String(r.review_focus).trim() === ""
          ? null
          : String(r.review_focus).trim();
      const reviewers = buildReviewCardReviewers(
        r.reviewer_contributor_ids,
        reviewerResolutionByRawId,
      );
      return {
        id: String(r.id ?? ""),
        title: String(r.title ?? ""),
        status: parseReviewDbStatus(String(r.status ?? "")),
        reviewType: parseReviewType(r.review_type as string | undefined),
        decisionStatus:
          r.decision_status == null || String(r.decision_status).trim() === ""
            ? null
            : String(r.decision_status),
        requireDecisionMaker: Boolean(r.require_decision_maker),
        ownerName: String(r.owner_display_name ?? "Reviewer"),
        creatorId: resolveReviewCardCreatorId(r.creator_id, reviewerResolutionByRawId),
        dateLabel,
        dateTooltipIso:
          r.created_at == null ? null : String(r.created_at),
        description: reviewFocus,
        review_focus: reviewFocus,
        review_focus_summary: null,
        review_focus_summary_source: null,
        feedbackCount: countsByReviewId.get(String(r.id ?? ""))?.feedbackCount ?? 0,
        changeRequestCount: countsByReviewId.get(String(r.id ?? ""))?.changeRequestCount ?? 0,
        reviewers,
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
  }, [project.id, reviewerType, supabase, workspacePermissionLevel]);

  useEffect(() => {
    setReviews(initialReviews);
  }, [initialReviews]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(REVIEWS_RHC_STORAGE_KEY);
    if (stored !== null) {
      setReviewsRhcOpen(stored === "true");
    } else {
      setReviewsRhcOpen(window.matchMedia("(min-width: 1024px)").matches);
    }
    setReviewsRhcHydrated(true);
  }, []);

  const toggleReviewsRhc = useCallback(() => {
    setReviewsRhcOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(REVIEWS_RHC_STORAGE_KEY, String(next));
      }
      return next;
    });
  }, []);

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

  useEffect(() => {
    if (!reviewsRhcOpen) {
      setIsReviewsScrolled(false);
      return;
    }
    const root = reviewsScrollRef.current;
    if (!root) return;

    const handleScroll = () => {
      setIsReviewsScrolled(root.scrollTop > 0);
    };

    handleScroll();
    root.addEventListener("scroll", handleScroll, { passive: true });
    return () => root.removeEventListener("scroll", handleScroll);
  }, [reviewsRhcOpen, reviews.length]);

  const canCreateReview = canCreateReviews(workspacePermissionLevel);
  const reviewsEmptyCopy =
    !isProjectComplete && canCreateReview
      ? "No reviews yet. Create a review to start capturing design decisions."
      : "No reviews yet. Reviews for this project will appear here.";

  const handleNewReview = useCallback(() => {
    if (!canCreateReview) return;
    openNewReview({
      mode: "project",
      projectId: project.id,
      projectProblems: reviewSeed.projectProblems,
      teammateOptions: reviewSeed.teammateOptions,
      onReviewCreated: () => {
        setSuccessToast("Review created successfully");
      }
    });
  }, [canCreateReview, openNewReview, project.id, reviewSeed]);

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
          clientName={clientLabel === "Unassigned" ? "Internal Project" : clientLabel}
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
          clientId={project.clientId}
          description={project.description}
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
            className="min-h-0 min-w-0 flex-1 overflow-y-auto pl-8 pt-6 pb-8"
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
                      readOnly={fieldsReadOnly}
                    />
                  </div>
                </section>

                <ProblemsSection
                  projectId={project.id}
                  initialProblems={initialProblems}
                  hideAddActions={hideContentActions}
                />

                <ContributorsSection
                  projectId={project.id}
                  initialContributors={initialContributors}
                  hideAddActions={isProjectComplete}
                  pendingAccessRequestCount={pendingAccessRequestCount}
                  pendingAccessRequesterNames={pendingAccessRequesterNames}
                  onPendingAccessRequestsChanged={() =>
                    void refreshPendingAccessRequests()
                  }
                />

                <ReferencesSection
                  projectId={project.id}
                  initialReferences={initialReferences}
                  hideAddActions={hideContentActions}
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
            className="flex shrink-0 min-h-0 flex-col bg-white h-full overflow-hidden"
            style={{
              width: reviewsRhcOpen ? REVIEWS_RHC_OPEN_WIDTH : REVIEWS_RHC_CLOSED_WIDTH,
              minWidth: reviewsRhcOpen ? 360 : REVIEWS_RHC_CLOSED_WIDTH,
              maxWidth: reviewsRhcOpen ? 440 : REVIEWS_RHC_CLOSED_WIDTH,
              borderLeft: "1px solid #e6dbd8",
              transition: reviewsRhcHydrated ? "width 200ms ease-in-out" : "none",
            }}
            aria-label="Reviews"
          >
            {reviewsRhcOpen ? (
              <>
                <div
                  className={`${sectionHeadingClass} shrink-0`}
                  style={{
                    ...sectionHeadingStyle,
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    backgroundColor: "#ffffff",
                    padding: "24px 24px 16px 24px",
                    boxShadow: isReviewsScrolled
                      ? "0 4px 12px 0 rgba(107, 30, 46, 0.08)"
                      : "none",
                    transition: "box-shadow 150ms ease",
                  }}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center">
                      <span className="shrink-0">Reviews</span>
                      {reviews.length > 0 ? (
                        <span className="ml-3 inline-flex shrink-0 items-center self-center">
                          <NotificationBadge
                            count={reviews.length}
                            sentiment="brand"
                            prominence="high"
                          />
                        </span>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      label="Collapse reviews panel"
                      aria-label="Collapse reviews panel"
                      variant="secondary"
                      size="sm"
                      icon="leading"
                      iconOnly
                      iconName="close-drawer"
                      style={reviewsRhcHeaderIconButtonStyle}
                      onClick={toggleReviewsRhc}
                    />
                  </div>
                </div>
                <div
                  ref={reviewsScrollRef}
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
                      className={`${panelEmptyStateStyles.root} ${panelEmptyStateStyles.surfaceRecessed}`}
                    >
                      <p className={panelEmptyStateStyles.copy}>
                        {reviewsEmptyCopy}
                      </p>
                      {!isProjectComplete && canCreateReview ? (
                        <Button
                          type="button"
                          variant="secondary"
                          label="Review"
                          icon="leading"
                          iconName="plus"
                          size="sm"
                          onClick={handleNewReview}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col" style={{ gap: 12 }}>
                      <div className="flex flex-col" style={{ gap: 4 }}>
                        {sortedReviews.map((r) => {
                          const card = (
                            <ReviewCard
                              title={r.title}
                              status={r.status}
                              reviewType={r.reviewType}
                              decisionStatus={r.decisionStatus}
                              requireDecisionMaker={r.requireDecisionMaker}
                              ownerName={r.ownerName}
                              creatorId={r.creatorId}
                              dateLabel={r.dateLabel}
                              dateTooltipIso={r.dateTooltipIso ?? undefined}
                              clientName={clientLabel}
                              description={r.description ?? undefined}
                              hasArtifact={false}
                              showDetailCounts={true}
                              feedbackCount={r.feedbackCount ?? 0}
                              changeRequestCount={r.changeRequestCount ?? 0}
                              reviewers={r.reviewers ?? []}
                            />
                          );

                          if (!r.id) {
                            return <div key={r.title}>{card}</div>;
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
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-4">
                <Button
                  type="button"
                  label="Expand reviews panel"
                  aria-label="Expand reviews panel"
                  variant="secondary"
                  size="sm"
                  icon="leading"
                  iconOnly
                  iconName="open-drawer"
                  style={reviewsRhcHeaderIconButtonStyle}
                  onClick={toggleReviewsRhc}
                />
                {reviews.length > 0 ? (
                  <NotificationBadge
                    count={reviews.length}
                    sentiment="brand"
                    prominence="high"
                  />
                ) : null}
              </div>
            )}
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
