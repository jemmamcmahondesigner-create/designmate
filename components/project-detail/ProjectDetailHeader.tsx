"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import {
  Button,
  Menu,
  MenuItem,
  PageHeader,
  StatusPill,
  Tooltip,
  type StatusPillStatus
} from "@/components/ui/ds";
import { useToast } from "@/components/Toast";
import { useNewReviewDrawer } from "@/components/NewReviewDrawerProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useActiveWorkspacePermission } from "@/hooks/useWorkspacePermission";
import { canCreateReviews, CREATE_REVIEW_DENIED_TOOLTIP } from "@/lib/workspace/permissions";
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
  initialStatus: ProjectStatus;
  reviewSeed: ProjectDetailHeaderReviewSeed;
};

function projectStatusToPill(
  s: ProjectStatus
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
  initialStatus,
  reviewSeed
}: ProjectDetailHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { openNewReview } = useNewReviewDrawer();
  const { showToast } = useToast();
  const { permissionLevel } = useActiveWorkspacePermission();

  const openReviewDrawer = useCallback(() => {
    openNewReview({
      mode: "project",
      projectId,
      projectProblems: reviewSeed.projectProblems,
      teammateOptions: reviewSeed.teammateOptions
    });
  }, [openNewReview, projectId, reviewSeed.projectProblems, reviewSeed.teammateOptions]);

  const [status, setStatus] = useState<ProjectStatus>(initialStatus);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);

  const statusRef = useRef<HTMLDivElement>(null);
  const kebabSectionRef = useRef<HTMLDivElement>(null);
  const primaryActionSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

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

  async function applyStatus(next: ProjectStatus) {
    const previous = status;
    setStatus(next);
    setStatusMenuOpen(false);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("projects")
      .update({ status: next })
      .eq("id", projectId);
    if (error) {
      setStatus(previous);
      return;
    }
    showToast("Changes saved");
  }

  async function deleteProject() {
    setKebabOpen(false);
    const ok = window.confirm(
      "Are you sure you want to delete this project?\n\nThis cannot be undone."
    );
    if (!ok) return;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) return;
    router.push("/projects");
  }

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
    [router, basePath]
  );

  const pill = projectStatusToPill(status);
  const canCreateReview = canCreateReviews(permissionLevel);

  return (
    <>
      <PageHeader
          variant="breadcrumb-tabs"
          breadcrumbSegments={[
            { label: 'Projects', href: '/projects' },
            { label: clientLabel }
          ]}
          pageTitle={projectName}
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
                <MenuItem
                  label="Active"
                  active={status === "active"}
                  onClick={() => void applyStatus("active")}
                />
                <MenuItem
                  label="Paused"
                  active={status === "paused"}
                  onClick={() => void applyStatus("paused")}
                />
                <MenuItem
                  label="Complete"
                  active={status === "complete"}
                  onClick={() => void applyStatus("complete")}
                />
              </Menu>
            </div>
          }
          tabs={[
            { label: "Overview" },
            { label: "Artifacts" },
            { label: "Timeline" }
          ]}
          activeTab={activeTabIndex}
          onTabChange={onTabChange}
          primaryActionSlot={
            canCreateReview ? (
              <Button
                variant="primary"
                size="sm"
                label="Review"
                icon="leading"
                iconName="plus"
                onClick={openReviewDrawer}
              />
            ) : (
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
            )
          }
          onKebab={() => {
            setKebabOpen((o) => !o);
            setStatusMenuOpen(false);
          }}
          kebabMenu={
            <Menu
              open={kebabOpen}
              onClose={() => setKebabOpen(false)}
              type="action-menu"
              anchorRef={kebabSectionRef}
              align="right"
              aria-label="Project options"
              footerAction={{
                type: "delete",
                label: "Delete project",
                onClick: () => void deleteProject()
              }}
            >
              {null}
            </Menu>
          }
          kebabMenuExpanded={kebabOpen}
          kebabSectionRef={kebabSectionRef}
          primaryActionSectionRef={primaryActionSectionRef}
        />
    </>
  );
}
