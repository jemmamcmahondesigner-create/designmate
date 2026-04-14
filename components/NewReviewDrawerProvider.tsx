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
import { CreateReviewDrawer } from "@/components/CreateReviewDrawer";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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
    return {
      id: String(o.id ?? ""),
      name: String(o.name ?? ""),
      email:
        email == null || String(email).trim() === "" ? null : String(email)
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
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"global" | "project">("global");
  const [scopedProjectId, setScopedProjectId] = useState<string | null>(null);
  const [globalProjectId, setGlobalProjectId] = useState("");
  const [projectProblems, setProjectProblems] = useState<ProjectProblem[]>([]);
  const [teammateOptions, setTeammateOptions] = useState<User[]>([]);

  const openNewReview = useCallback((payload?: OpenNewReviewPayload) => {
    if (payload && payload.mode === "project") {
      setScope("project");
      setScopedProjectId(payload.projectId);
      setGlobalProjectId("");
      setProjectProblems(payload.projectProblems);
      setTeammateOptions(payload.teammateOptions);
    } else {
      setScope("global");
      setScopedProjectId(null);
      setGlobalProjectId("");
      setProjectProblems([]);
      setTeammateOptions([]);
    }
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setGlobalProjectId("");
  }, []);

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
      const [{ data: problemsRows }, { data: contributorsRows }] =
        await Promise.all([
          supabase
            .from("problems")
            .select("id, description")
            .eq("project_id", globalProjectId)
            .order("created_at", { ascending: true }),
          supabase
            .from("contributors")
            .select("id, name, email, role")
            .eq("project_id", globalProjectId)
            .order("created_at", { ascending: true })
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
        router.refresh();
      }
      return result;
    },
    [router]
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
      <CreateReviewDrawer
        open={open}
        onClose={handleClose}
        teammateOptions={teammateOptions}
        projectProblems={projectProblems}
        projectScoped={projectScoped}
        projectMenuOptions={allProjects}
        selectedRelatedProjectId={globalProjectId}
        onSelectedRelatedProjectIdChange={setGlobalProjectId}
        reviewerPoolKey={reviewerPoolKey}
        effectiveProjectId={effectiveProjectId}
        onCreateReview={handleCreateReview}
      />
    </NewReviewDrawerContext.Provider>
  );
}
