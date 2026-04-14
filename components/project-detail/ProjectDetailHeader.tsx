"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { createPortal } from "react-dom";
import { Button, Icon } from "@/components/ui/ds";
import { useNewReviewDrawer } from "@/components/NewReviewDrawerProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProjectProblem, ProjectStatus } from "@/types/project";
import type { User } from "@/types/user";

function FixedToastPortal({
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

const menuPanelStyle: CSSProperties = {
  position: "absolute",
  zIndex: 50,
  backgroundColor: "#ffffff",
  border: "1px solid #e4ddd3",
  borderRadius: 8,
  boxShadow: "0px 4px 12px rgba(41,33,28,0.12)"
};

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

export function ProjectDetailHeader({
  projectId,
  projectName,
  clientLabel,
  initialStatus,
  reviewSeed
}: ProjectDetailHeaderProps) {
  const router = useRouter();
  const { openNewReview } = useNewReviewDrawer();

  const openReviewDrawer = useCallback(() => {
    setNewReviewMenuOpen(false);
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
  const [newReviewMenuOpen, setNewReviewMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const statusRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLDivElement>(null);
  const newReviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const closeAllMenus = useCallback(() => {
    setStatusMenuOpen(false);
    setKebabOpen(false);
    setNewReviewMenuOpen(false);
  }, []);

  useEffect(() => {
    function onPointerDown(ev: PointerEvent) {
      const t = ev.target as Node;
      if (
        statusRef.current?.contains(t) ||
        kebabRef.current?.contains(t) ||
        newReviewRef.current?.contains(t)
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
    const label =
      next === "active" ? "Active" : next === "paused" ? "Paused" : "Complete";
    setToast(`Status updated to ${label}`);
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

  const statusLabel =
    status === "active"
      ? "ACTIVE"
      : status === "paused"
        ? "PAUSED"
        : "COMPLETE";
  const statusBg =
    status === "active"
      ? "#3b9b54"
      : status === "paused"
        ? "#b8b0a8"
        : "#7e7269";
  const statusBorder =
    status === "complete"
      ? { border: "1px solid #5c524a" as const }
      : { border: "1px solid transparent" as const };

  const statusOptions: {
    value: ProjectStatus;
    label: string;
    dot: string;
  }[] = [
    { value: "active", label: "Active", dot: "#3b9b54" },
    { value: "paused", label: "Paused", dot: "#b8b0a8" },
    { value: "complete", label: "Complete", dot: "#7e7269" }
  ];

  return (
    <>
      {toast ? (
        <FixedToastPortal message={toast} onDone={() => setToast(null)} />
      ) : null}
      <header className="shrink-0 bg-white">
        <div
          className="flex flex-wrap items-start justify-between gap-4"
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid #ede8e0"
          }}
        >
          <div className="min-w-0 flex-1">
            <nav
              className="text-[12px] font-normal leading-[1.5] text-[#998c82] tracking-[0.24px]"
              aria-label="Breadcrumb"
            >
              <Link
                href="/projects"
                className="text-[12px] font-normal leading-[1.5] tracking-[0.24px] text-[#998c82] decoration-solid underline-offset-2 hover:text-[#6b5e55] hover:underline"
              >
                Projects
              </Link>
              <span aria-hidden>{"  /  "}</span>
              <Link
                href="/projects"
                className="text-[12px] font-normal leading-[1.5] tracking-[0.24px] text-[#998c82] decoration-solid underline-offset-2 hover:text-[#6b5e55] hover:underline"
              >
                {clientLabel}
              </Link>
            </nav>
            <div
              className="mt-2 flex min-w-0 flex-wrap items-center gap-3"
              style={{ rowGap: 8 }}
            >
              <h1
                className="min-w-0 text-[24px] font-bold leading-[1.25]"
                style={{ color: "#6b1e2e", letterSpacing: "-0.36px" }}
              >
                {projectName}
              </h1>
              <div className="relative" ref={statusRef}>
                <button
                  type="button"
                  className="inline-flex items-center gap-[4px] rounded-full px-[12px] py-[6px] text-[10px] font-semibold uppercase leading-none text-white outline-none"
                  style={{
                    backgroundColor: statusBg,
                    letterSpacing: "0.5px",
                    ...statusBorder
                  }}
                  aria-expanded={statusMenuOpen}
                  aria-haspopup="listbox"
                  onClick={() => {
                    setStatusMenuOpen((o) => !o);
                    setKebabOpen(false);
                    setNewReviewMenuOpen(false);
                  }}
                >
                  <span>{statusLabel}</span>
                  <span className="inline-flex shrink-0 text-white">
                    <Icon name="chevron-down" size={14} />
                  </span>
                </button>
                {statusMenuOpen ? (
                  <div
                    role="listbox"
                    className="absolute left-0 top-full mt-1 min-w-[160px] py-1"
                    style={{ ...menuPanelStyle, top: "100%" }}
                  >
                    {statusOptions.map((opt) => {
                      const selected = status === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-[13px] font-medium leading-[1.5] text-[#2e1c1c]"
                          style={{ letterSpacing: "0.26px" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#f3efe9";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                          onClick={() => void applyStatus(opt.value)}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor: opt.dot,
                              flexShrink: 0
                            }}
                          />
                          <span className="min-w-0 flex-1">{opt.label}</span>
                          {selected ? (
                            <span className="inline-flex shrink-0 text-[#2e1c1c]">
                              <Icon name="check" size={14} />
                            </span>
                          ) : (
                            <span className="w-[14px] shrink-0" aria-hidden />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="relative" ref={newReviewRef}>
              <div
                className="flex overflow-hidden"
                style={{ height: 32, borderRadius: 6 }}
              >
                <Button
                  type="button"
                  variant="primary"
                  label="New Review"
                  size="sm"
                  className="!h-8 !min-h-0"
                  style={{ borderRadius: "6px 0 0 6px" }}
                  onClick={openReviewDrawer}
                />
                <button
                  type="button"
                  className="inline-flex h-8 w-8 min-w-[32px] shrink-0 items-center justify-center border-0 p-0 outline-none"
                  style={{
                    backgroundColor: "#6b1e2e",
                    borderLeft: "1px solid rgba(255,255,255,0.25)",
                    borderRadius: "0 6px 6px 0"
                  }}
                  aria-expanded={newReviewMenuOpen}
                  aria-haspopup="menu"
                  aria-label="New review options"
                  onClick={() => {
                    setNewReviewMenuOpen((o) => !o);
                    setStatusMenuOpen(false);
                    setKebabOpen(false);
                  }}
                >
                  <span className="inline-flex text-white">
                    <Icon name="chevron-down" size={14} />
                  </span>
                </button>
              </div>
              {newReviewMenuOpen ? (
                <div
                  className="absolute right-0 top-full mt-1 min-w-[200px] py-1"
                  role="menu"
                  style={menuPanelStyle}
                >
                  <Button
                    type="button"
                    role="menuitem"
                    variant="ghost"
                    label="New Review"
                    icon="leading"
                    iconName="plus"
                    className="w-full justify-start !rounded-none !px-3 !py-2"
                    onClick={openReviewDrawer}
                  />
                  <Button
                    type="button"
                    role="menuitem"
                    variant="ghost"
                    label="Create Decision"
                    icon="leading"
                    iconName="check-square"
                    className="w-full justify-start !rounded-none !px-3 !py-2"
                    onClick={() => setNewReviewMenuOpen(false)}
                  />
                </div>
              ) : null}
            </div>
            <div className="relative" ref={kebabRef}>
              <button
                type="button"
                className="inline-flex h-8 w-8 min-w-[32px] shrink-0 items-center justify-center border border-solid bg-white p-0 outline-none"
                style={{
                  borderColor: "#e4ddd3",
                  borderRadius: 6
                }}
                aria-label="More options"
                aria-expanded={kebabOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setKebabOpen((o) => !o);
                  setStatusMenuOpen(false);
                  setNewReviewMenuOpen(false);
                }}
              >
                <span
                  className="inline-flex text-[#2e1c1c]"
                  style={{ transform: "rotate(90deg)" }}
                >
                  <Icon name="kebab" size={14} />
                </span>
              </button>
              {kebabOpen ? (
                <div
                  className="absolute right-0 top-full mt-1 min-w-[180px] py-1"
                  role="menu"
                  style={menuPanelStyle}
                >
                  <Button
                    type="button"
                    role="menuitem"
                    variant="destructive"
                    label="Delete project"
                    className="destructive w-full justify-start !rounded-none !px-3 !py-2"
                    onClick={() => void deleteProject()}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
