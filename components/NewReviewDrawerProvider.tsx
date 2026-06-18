"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";
import { DiscardChangesModal } from "@/components/DiscardChangesModal";
import { CreateReviewDrawer } from "@/components/CreateReviewDrawer";
import { useToast } from "@/components/Toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveWorkspaceId } from "@/lib/workspace/activeWorkspace";
import {
  submitReviewClient,
  type SubmitReviewInput
} from "@/lib/reviews/submitReviewClient";
import type { ProjectProblem } from "@/types/project";
import type { User } from "@/types/user";

export type ProjectMenuOption = { id: string; name: string };

export type OpenNewReviewPayload =
  | { mode?: "global" }
  | {
      mode: "project";
      projectId: string;
      projectProblems: ProjectProblem[];
      teammateOptions: User[];
      /** Fires after a review is created successfully from this project context */
      onReviewCreated?: () => void;
    };

type NewReviewDrawerContextValue = {
  openNewReview: (payload?: OpenNewReviewPayload) => void;
};

const NewReviewDrawerContext = createContext<NewReviewDrawerContextValue | null>(
  null
);

export function useNewReviewDrawer() {
  const ctx = useContext(NewReviewDrawerContext);
  if (!ctx) {
    throw new Error("useNewReviewDrawer must be used within NewReviewDrawerProvider");
  }
  return ctx;
}

function mapProblems(rows: unknown): ProjectProblem[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      id: String(o.id ?? ""),
      description: String(o.description ?? "")
    };
  });
}

function mapContributorsToUsers(rows: unknown): User[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const o = r as Record<string, unknown>;
    const email = o.email;
    const avatarRaw = o.avatar_url ?? o.avatarUrl;
    const avatarUrl =
      avatarRaw == null || String(avatarRaw).trim() === ""
        ? null
        : String(avatarRaw);
    return {
      id: String(o.id ?? ""),
      name: String(o.name ?? ""),
      email:
        email == null || String(email).trim() === "" ? null : String(email),
      avatarUrl
    };
  });
}

export function NewReviewDrawerProvider({
  children,
  allProjects
}: Readonly<{
  children: ReactNode;
  allProjects: ProjectMenuOption[];
}>) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [drawerDirty, setDrawerDirty] = useState(false);
  const [navDiscardOpen, setNavDiscardOpen] = useState(false);
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  const [scope, setScope] = useState<"global" | "project">("global");
  const [scopedProjectId, setScopedProjectId] = useState<string | null>(null);
  const [globalProjectId, setGlobalProjectId] = useState("");
  const [projectProblems, setProjectProblems] = useState<ProjectProblem[]>([]);
  const [teammateOptions, setTeammateOptions] = useState<User[]>([]);
  const [onReviewCreated, setOnReviewCreated] = useState<(() => void) | null>(
    null
  );

  const openNewReview = useCallback((payload?: OpenNewReviewPayload) => {
    if (payload && payload.mode === "project") {
      setScope("project");
      setScopedProjectId(payload.projectId);
      setGlobalProjectId("");
      setProjectProblems(payload.projectProblems);
      setTeammateOptions(payload.teammateOptions);
      setOnReviewCreated(() => payload.onReviewCreated ?? null);
    } else {
      setScope("global");
      setScopedProjectId(null);
      setGlobalProjectId("");
      setProjectProblems([]);
      setTeammateOptions([]);
      setOnReviewCreated(null);
    }
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setGlobalProjectId("");
    setOnReviewCreated(null);
    setDrawerDirty(false);
  }, []);

  // TODO: Also apply this guard to browser back/forward navigation via useRouter or similar once router config is confirmed

  useEffect(() => {
    if (!open || !drawerDirty) return;
    function onPointerDownCapture(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      const a = t?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const nav = a.closest('[aria-label="Main navigation"]');
      if (!nav) return;
      e.preventDefault();
      e.stopPropagation();
      const href = a.getAttribute("href");
      setPendingNavHref(href && href.trim() ? href.trim() : null);
      setNavDiscardOpen(true);
    }
    document.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => document.removeEventListener("pointerdown", onPointerDownCapture, true);
  }, [open, drawerDirty]);

  useEffect(() => {
    if (!open || scope !== "global" || !globalProjectId) {
      if (scope === "global" && !globalProjectId) {
        setProjectProblems([]);
        setTeammateOptions([]);
      }
      return;
    }

    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    void (async () => {
      const activeWorkspaceId = await getActiveWorkspaceId(supabase);
      let contributorsQuery = supabase
        .from("contributors")
        .select("id, name, email, role")
        .eq("project_id", globalProjectId)
        .order("created_at", { ascending: true });
      if (activeWorkspaceId) {
        contributorsQuery = contributorsQuery.eq("workspace_id", activeWorkspaceId);
      }

      const [{ data: problemsRows }, { data: contributorsRows }] = await Promise.all([
        supabase
          .from("problems")
          .select("id, description")
          .eq("project_id", globalProjectId)
          .is("review_id", null)
          .order("created_at", { ascending: true }),
        contributorsQuery,
      ]);

      if (cancelled) return;
      setProjectProblems(mapProblems(problemsRows));
      setTeammateOptions(mapContributorsToUsers(contributorsRows));
    })();

    return () => {
      cancelled = true;
    };
  }, [open, scope, globalProjectId]);

  const projectScoped = scope === "project";
  const reviewerPoolKey = projectScoped
    ? scopedProjectId ?? ""
    : globalProjectId;

  const effectiveProjectId = projectScoped
    ? scopedProjectId ?? ""
    : globalProjectId;

  const handleCreateReview = useCallback(
    async (input: SubmitReviewInput) => {
      const result = await submitReviewClient(input);
      if (!result.error) {
        showToast("Review created");
        if (input.sendNotification) {
          showToast({
            message: "Reviewers notified",
            actionLabel: "View",
            onAction: () => {
              router.push(`/reviews/${input.reviewId}?tab=activity`);
            },
          });
        }
        router.push(`/reviews/${input.reviewId}`);
        router.refresh();
      }
      return result;
    },
    [router, showToast]
  );

  const ctx = useMemo(
    () => ({
      openNewReview
    }),
    [openNewReview]
  );

  return (
    <NewReviewDrawerContext.Provider value={ctx}>
      {children}
      <DiscardChangesModal
        open={navDiscardOpen}
        title="Unsaved changes?"
        message="You have unsaved changes. If you leave now your review details will be lost."
        keepEditingLabel="Stay"
        discardLabel="Leave anyway"
        onKeepEditing={() => {
          setNavDiscardOpen(false);
          setPendingNavHref(null);
        }}
        onDiscard={() => {
          const href = pendingNavHref;
          setNavDiscardOpen(false);
          setPendingNavHref(null);
          handleClose();
          if (href) router.push(href);
        }}
      />
      <CreateReviewDrawer
        open={open}
        onClose={handleClose}
        onDirtyChange={setDrawerDirty}
        teammateOptions={teammateOptions}
        projectProblems={projectProblems}
        projectScoped={projectScoped}
        projectMenuOptions={allProjects}
        selectedRelatedProjectId={globalProjectId}
        onSelectedRelatedProjectIdChange={setGlobalProjectId}
        reviewerPoolKey={reviewerPoolKey}
        effectiveProjectId={effectiveProjectId}
        onCreateReview={handleCreateReview}
        onReviewCreated={onReviewCreated ?? undefined}
      />
    </NewReviewDrawerContext.Provider>
  );
}
