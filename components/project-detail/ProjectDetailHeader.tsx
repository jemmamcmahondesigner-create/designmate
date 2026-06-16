"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  Menu,
  MenuItem,
  PageHeader,
  StatusPill,
  Tooltip,
  type StatusPillStatus,
} from "@/components/ui/ds";
import {
  EditProjectDrawer,
  type EditableProject,
} from "@/components/project-detail/EditProjectDrawer";
import { CompleteProjectModal } from "@/components/project-detail/CompleteProjectModal";
import { ReactivateProjectModal } from "@/components/project-detail/ReactivateProjectModal";
import { useToast } from "@/components/Toast";
import { useNewReviewDrawer } from "@/components/NewReviewDrawerProvider";
import {
  completeProjectAction,
  reactivateProjectAction,
  saveProjectEditsAction,
} from "@/app/projects/actions";
import { getProjectSaveToastMessage } from "@/lib/projects/projectSaveToastMessage";
import { getProjectStatusMenuOptions } from "@/lib/projects/projectStatusTransitions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useActiveWorkspacePermission } from "@/hooks/useWorkspacePermission";
import { loadPendingAccessRequestClient } from "@/lib/accessRequests/loadPendingAccessRequest";
import { formatAccessRequestSentTooltip } from "@/lib/accessRequests/formatAccessRequestSentTooltip";
import { submitAccessRequestClient } from "@/lib/accessRequests/submitAccessRequestClient";
import {
  deriveIsProjectMember,
  resolveHasProjectContributorRowClient,
} from "@/lib/project-detail/resolveProjectMembershipClient";
import {
  canCreateReviews,
  CREATE_REVIEW_DENIED_TOOLTIP,
  normalizeWorkspacePermission,
} from "@/lib/workspace/permissions";
import type { ProjectProblem, ProjectStatus } from "@/types/project";
import type { User } from "@/types/user";

export type ProjectDetailHeaderReviewSeed = {
  projectProblems: ProjectProblem[];
  teammateOptions: User[];
};

type ProjectDetailHeaderProps = {
  projectId: string;
  projectName: string;
  clientLabel: string;
  clientId: string | null;
  description: string | null;
  initialStatus: ProjectStatus;
  reviewSeed: ProjectDetailHeaderReviewSeed;
};

function projectStatusToPill(
  s: ProjectStatus,
): { status: StatusPillStatus; label: string } {
  switch (s) {
    case "active":
      return { status: "approved", label: "Active" };
    case "paused":
      return { status: "draft", label: "Paused" };
    case "complete":
      return { status: "closed", label: "Complete" };
    default:
      return { status: "draft", label: "Paused" };
  }
}

export function ProjectDetailHeader({
  projectId,
  projectName,
  clientLabel,
  clientId,
  description,
  initialStatus,
  reviewSeed,
}: ProjectDetailHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { openNewReview } = useNewReviewDrawer();
  const { showToast } = useToast();
  const {
    workspacePermissionLevel,
    userId: workspaceUserId,
    workspacePermissionLoading,
  } = useActiveWorkspacePermission();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [accessRequestSent, setAccessRequestSent] = useState(false);
  const [accessRequestRecipientName, setAccessRequestRecipientName] = useState<
    string | null
  >(null);
  const [accessRequestSentAt, setAccessRequestSentAt] = useState<string | null>(
    null,
  );
  const [accessRequestSubmitting, setAccessRequestSubmitting] = useState(false);
  const [hasProjectContributorRow, setHasProjectContributorRow] = useState<
    boolean | null
  >(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [requesterContributorId, setRequesterContributorId] = useState<
    string | null
  >(null);

  const [displayName, setDisplayName] = useState(projectName);
  const [displayClientLabel, setDisplayClientLabel] = useState(clientLabel);
  const [editClientId, setEditClientId] = useState(clientId);
  const [editDescription, setEditDescription] = useState(description);
  const [status, setStatus] = useState<ProjectStatus>(initialStatus);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const statusRef = useRef<HTMLDivElement>(null);
  const kebabSectionRef = useRef<HTMLDivElement>(null);
  const primaryActionSectionRef = useRef<HTMLDivElement>(null);

  const openReviewDrawer = useCallback(() => {
    openNewReview({
      mode: "project",
      projectId,
      projectProblems: reviewSeed.projectProblems,
      teammateOptions: reviewSeed.teammateOptions,
    });
  }, [openNewReview, projectId, reviewSeed.projectProblems, reviewSeed.teammateOptions]);

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

  useEffect(() => {
    setDisplayName(projectName);
  }, [projectName]);

  useEffect(() => {
    setDisplayClientLabel(clientLabel);
  }, [clientLabel]);

  useEffect(() => {
    setEditClientId(clientId);
  }, [clientId]);

  useEffect(() => {
    setEditDescription(description);
  }, [description]);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const hasRow = await resolveHasProjectContributorRowClient(
        supabase,
        projectId,
        workspaceUserId,
      );

      if (cancelled) return;
      setHasProjectContributorRow(hasRow);

      const { data: projectRow } = await supabase
        .from("projects")
        .select("workspace_id")
        .eq("id", projectId)
        .maybeSingle();
      const resolvedWorkspaceId = String(
        (projectRow as { workspace_id?: string | null } | null)?.workspace_id ?? "",
      ).trim();
      if (!resolvedWorkspaceId) {
        setWorkspaceId(null);
        return;
      }
      setWorkspaceId(resolvedWorkspaceId);

      const { requesterContributorId: requesterId, pending } =
        await loadPendingAccessRequestClient(supabase, {
          workspaceId: resolvedWorkspaceId,
          projectId,
        });
      if (cancelled) return;
      setRequesterContributorId(requesterId);
      if (pending) {
        setAccessRequestSent(true);
        setAccessRequestRecipientName(pending.recipientName);
        setAccessRequestSentAt(pending.createdAt);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, supabase, workspaceUserId]);

  const handleRequestAccess = useCallback(async () => {
    if (
      accessRequestSent ||
      accessRequestSubmitting ||
      !workspaceId ||
      !requesterContributorId
    ) {
      return;
    }

    setAccessRequestSubmitting(true);
    const result = await submitAccessRequestClient({
      supabase,
      projectId,
      workspaceId,
      requestedByContributorId: requesterContributorId,
    });
    setAccessRequestSubmitting(false);

    if (!result.success) return;

    showToast({ message: "Access request sent" });
    setAccessRequestSent(true);
    setAccessRequestRecipientName(result.recipientName);
    setAccessRequestSentAt(new Date().toISOString());
  }, [
    accessRequestSent,
    accessRequestSubmitting,
    projectId,
    requesterContributorId,
    showToast,
    supabase,
    workspaceId,
  ]);

  const closeAllMenus = useCallback(() => {
    setStatusMenuOpen(false);
    setKebabOpen(false);
  }, []);

  useEffect(() => {
    function onPointerDown(ev: PointerEvent) {
      const t = ev.target as Node;
      if (
        statusRef.current?.contains(t) ||
        kebabSectionRef.current?.contains(t) ||
        primaryActionSectionRef.current?.contains(t)
      ) {
        return;
      }
      closeAllMenus();
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") closeAllMenus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [closeAllMenus]);

  const statusMenuOptions = useMemo(
    () => getProjectStatusMenuOptions(status),
    [status],
  );

  const buildSaveInput = useCallback(
    (nextStatus: ProjectStatus) => ({
      projectId,
      name: displayName.trim(),
      description: editDescription,
      clientId: editClientId,
      status: nextStatus,
      previous: {
        name: displayName.trim(),
        description: editDescription,
        clientId: editClientId,
        clientName: displayClientLabel === "Unassigned" ? null : displayClientLabel,
        status,
      },
    }),
    [
      projectId,
      displayName,
      editDescription,
      editClientId,
      displayClientLabel,
      status,
    ],
  );

  const applyStatusChange = useCallback(
    async (nextStatus: ProjectStatus) => {
      const previousStatus = status;
      setStatusSubmitting(true);
      const result = await saveProjectEditsAction(buildSaveInput(nextStatus));
      setStatusSubmitting(false);

      if (!result.success) return;

      setStatus(nextStatus);
      showToast(
        getProjectSaveToastMessage({
          previousStatus,
          nextStatus,
        }),
      );
      router.refresh();
    },
    [buildSaveInput, router, showToast, status],
  );

  const handleConfirmComplete = useCallback(async () => {
    const previousStatus = status;
    setCompleteModalOpen(false);
    setStatusSubmitting(true);
    const result = await completeProjectAction(buildSaveInput("complete"));
    setStatusSubmitting(false);

    if (!result.success) return;

    setStatus("complete");
    showToast(
      getProjectSaveToastMessage({
        previousStatus,
        nextStatus: "complete",
      }),
    );
    router.refresh();
  }, [buildSaveInput, router, showToast, status]);

  const handleConfirmReactivate = useCallback(async () => {
    const previousStatus = status;
    setReactivateModalOpen(false);
    setStatusSubmitting(true);
    const result = await reactivateProjectAction(projectId);
    setStatusSubmitting(false);

    if (!result.success) return;

    setStatus("active");
    showToast(
      getProjectSaveToastMessage({
        previousStatus,
        nextStatus: "active",
      }),
    );
    router.refresh();
  }, [projectId, router, showToast, status]);

  const handleCloseCompleteModal = useCallback(() => {
    setCompleteModalOpen(false);
  }, []);

  const handleCloseReactivateModal = useCallback(() => {
    setReactivateModalOpen(false);
  }, []);

  const handleStatusPick = useCallback(
    (next: ProjectStatus) => {
      if (next === status || statusSubmitting) {
        setStatusMenuOpen(false);
        return;
      }

      setStatusMenuOpen(false);

      if (status === "complete" && next === "active") {
        setReactivateModalOpen(true);
        return;
      }

      if (
        next === "complete" &&
        (status === "active" || status === "paused")
      ) {
        setCompleteModalOpen(true);
        return;
      }

      void applyStatusChange(next);
    },
    [applyStatusChange, status, statusSubmitting],
  );

  const deleteProject = useCallback(async () => {
    setKebabOpen(false);
    const ok = window.confirm(
      "Are you sure you want to delete this project?\n\nThis cannot be undone.",
    );
    if (!ok) return;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) return;
    router.push("/projects");
  }, [projectId, router]);

  const handleProjectSaved = useCallback(
    async (updated: EditableProject, toastMessage: string) => {
      setDisplayName(updated.name);
      setStatus(updated.status);
      setEditClientId(updated.clientId);
      setEditDescription(updated.description);

      if (updated.clientId) {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase
          .from("clients")
          .select("name")
          .eq("id", updated.clientId)
          .maybeSingle();
        const clientName = data
          ? String((data as Record<string, unknown>).name ?? "").trim()
          : "";
        setDisplayClientLabel(clientName || "Unassigned");
      } else {
        setDisplayClientLabel("Unassigned");
      }

      showToast(toastMessage);
    },
    [showToast],
  );

  const editProject: EditableProject = {
    id: projectId,
    name: displayName,
    description: editDescription,
    clientId: editClientId,
    clientName: displayClientLabel === "Unassigned" ? null : displayClientLabel,
    status,
  };

  const basePath = `/projects/${projectId}`;
  const activeTabIndex =
    pathname === basePath
      ? 0
      : pathname === `${basePath}/artifacts`
        ? 1
        : pathname === `${basePath}/timeline`
          ? 2
          : 0;

  const onTabChange = useCallback(
    (index: number) => {
      if (index === 0) router.push(basePath);
      else if (index === 1) router.push(`${basePath}/artifacts`);
      else router.push(`${basePath}/timeline`);
    },
    [router, basePath],
  );

  const pill = projectStatusToPill(status);
  const canCreateReview = canCreateReviews(workspacePermissionLevel);
  const isProjectComplete = status === "complete";
  const showRequestAccessOrSent =
    isProjectMember === false &&
    !workspacePermissionLoading &&
    normalizeWorkspacePermission(workspacePermissionLevel) === "reviewer";

  const primaryActionSlot = useMemo(() => {
    if (isProjectComplete) return null;

    if (showRequestAccessOrSent) {
      if (accessRequestSent) {
        const tooltipLabel = formatAccessRequestSentTooltip(
          accessRequestRecipientName,
          accessRequestSentAt,
        );
        return (
          <Tooltip label={tooltipLabel} position="bottom">
            <span style={{ display: "inline-flex" }}>
              <Button
                variant="accent"
                size="sm"
                label="Request Sent"
                disabled
              />
            </span>
          </Tooltip>
        );
      }

      return (
        <Button
          variant="accent"
          size="sm"
          label="Request Access"
          disabled={accessRequestSubmitting || !requesterContributorId}
          onClick={() => void handleRequestAccess()}
        />
      );
    }

    if (canCreateReview) {
      return (
        <Button
          variant="primary"
          size="sm"
          label="Review"
          icon="leading"
          iconName="plus"
          onClick={openReviewDrawer}
        />
      );
    }

    return (
      <Tooltip label={CREATE_REVIEW_DENIED_TOOLTIP} position="bottom">
        <span style={{ display: "inline-flex" }}>
          <Button
            variant="primary"
            size="sm"
            label="Review"
            icon="leading"
            iconName="plus"
            disabled
            onClick={openReviewDrawer}
          />
        </span>
      </Tooltip>
    );
  }, [
    accessRequestRecipientName,
    accessRequestSent,
    accessRequestSentAt,
    accessRequestSubmitting,
    canCreateReview,
    handleRequestAccess,
    isProjectComplete,
    openReviewDrawer,
    requesterContributorId,
    showRequestAccessOrSent,
  ]);

  return (
    <>
      <PageHeader
        variant="breadcrumb-tabs"
        breadcrumbSegments={[
          { label: "Projects", href: "/projects" },
          { label: displayClientLabel },
        ]}
        pageTitle={displayName}
        showStatus
        statusSlot={
          <div ref={statusRef} className="relative">
            <StatusPill
              label={pill.label}
              status={pill.status}
              size="lg"
              prominence="high"
              state="interactive"
              onClick={() => {
                setStatusMenuOpen((o) => !o);
                setKebabOpen(false);
              }}
            />
            <Menu
              open={statusMenuOpen}
              onClose={() => setStatusMenuOpen(false)}
              type="context-menu"
              anchorRef={statusRef}
              align="left"
              aria-label="Project status"
            >
              {statusMenuOptions.map((opt) => (
                <MenuItem
                  key={opt.value}
                  label={opt.label}
                  onClick={() => handleStatusPick(opt.value)}
                />
              ))}
            </Menu>
          </div>
        }
        tabs={[
          { label: "Overview" },
          { label: "Artifacts" },
          { label: "Timeline" },
        ]}
        activeTab={activeTabIndex}
        onTabChange={onTabChange}
        primaryActionSlot={primaryActionSlot}
        onKebab={() => {
          setKebabOpen((o) => !o);
          setStatusMenuOpen(false);
        }}
        kebabMenu={
          <Menu
            open={kebabOpen}
            onClose={() => setKebabOpen(false)}
            type="dropdown"
            anchorRef={kebabSectionRef}
            align="right"
            aria-label="Project options"
          >
            <MenuItem
              label="Edit project"
              onClick={() => {
                setKebabOpen(false);
                setEditOpen(true);
              }}
            />
            {!isProjectComplete ? (
              <MenuItem
                label="Delete project"
                destructive
                onClick={() => void deleteProject()}
              />
            ) : null}
          </Menu>
        }
        kebabMenuExpanded={kebabOpen}
        kebabSectionRef={kebabSectionRef}
        primaryActionSectionRef={primaryActionSectionRef}
      />
      <EditProjectDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={editProject}
        onSaved={handleProjectSaved}
      />
      <CompleteProjectModal
        open={completeModalOpen}
        onClose={handleCloseCompleteModal}
        onConfirm={() => void handleConfirmComplete()}
      />
      <ReactivateProjectModal
        open={reactivateModalOpen}
        onClose={handleCloseReactivateModal}
        onConfirm={() => void handleConfirmReactivate()}
      />
    </>
  );
}
