"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import { createPortal } from "react-dom";
import { Button, Icon, Input } from "@/components/ui/ds";
import { RoleSelect } from "@/components/ui/RoleSelect";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProjectContributor } from "@/types/project";

const sectionHeadingClass =
  "text-[20px] font-semibold leading-[1.3] text-[#6b1e2e]";

const sectionHeadingStyle = { letterSpacing: "-0.3px" as const };

const ROLE_OPTIONS = [
  "Designer",
  "Product Manager",
  "Engineer",
  "Stakeholder",
  "Client",
  "Other"
] as const;

type Mode = "idle" | "search" | "create";

type ContributorsSectionProps = {
  projectId: string;
  initialContributors: ProjectContributor[];
};

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

function UndoToastPortal({
  message,
  onUndo,
  onDone
}: {
  message: string;
  onUndo: () => void | Promise<void>;
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
      className="fixed z-50 flex flex-wrap items-center"
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
        maxWidth: 400
      }}
      role="status"
    >
      <span>{message}</span>
      <Button
        type="button"
        variant="ghost"
        label="Undo"
        className="ml-3 !p-0 underline"
        onClick={() => {
          void Promise.resolve(onUndo()).then(() => onDone());
        }}
      />
    </div>,
    document.body
  );
}

export function ContributorsSection({
  projectId,
  initialContributors
}: ContributorsSectionProps) {
  const [contributors, setContributors] =
    useState<ProjectContributor[]>(initialContributors);
  const [mode, setMode] = useState<Mode>("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState<string>(ROLE_OPTIONS[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; key: number } | null>(
    null
  );
  const [undoToast, setUndoToast] = useState<{ key: number } | null>(null);
  const undoContributorSnapshotRef = useRef<ProjectContributor | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contributors;
    return contributors.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
    );
  }, [contributors, searchQuery]);

  useEffect(() => {
    if (mode === "search") {
      searchInputRef.current?.focus();
    }
    if (mode === "create") {
      nameInputRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    if (mode === "idle") return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (flowRef.current?.contains(e.target as Node)) return;
      setMode("idle");
      setSearchQuery("");
      setNameDraft("");
      setEmailDraft("");
      setRoleDraft(ROLE_OPTIONS[0]);
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode("idle");
        setSearchQuery("");
        setNameDraft("");
        setEmailDraft("");
        setRoleDraft(ROLE_OPTIONS[0]);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mode]);

  const showToast = useCallback((message: string) => {
    setToast({ message, key: Date.now() });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const dismissUndoToast = useCallback(() => {
    setUndoToast(null);
  }, []);

  const closeCreateForm = useCallback(() => {
    setNameDraft("");
    setEmailDraft("");
    setRoleDraft(ROLE_OPTIONS[0]);
    setMode("idle");
  }, []);

  const addContributorClone = useCallback(
    async (c: ProjectContributor) => {
      if (isSaving) return;
      setIsSaving(true);
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("contributors")
        .insert({
          project_id: projectId,
          name: c.name,
          email: c.email,
          role: c.role
        })
        .select("id, name, email, role")
        .single();

      setIsSaving(false);
      if (error || !data) return;

      const row = data as {
        id: string;
        name: string;
        email: string | null;
        role: string | null;
      };
      setContributors((prev) => [
        ...prev,
        {
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role
        }
      ]);
      showToast("Team member added");
      setMode("idle");
      setSearchQuery("");
    },
    [isSaving, projectId, showToast]
  );

  const saveNewContributor = useCallback(async () => {
    const name = nameDraft.trim();
    if (!name || isSaving) return;
    setIsSaving(true);
    const emailTrim = emailDraft.trim();
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("contributors")
      .insert({
        project_id: projectId,
        name,
        email: emailTrim === "" ? null : emailTrim,
        role: roleDraft || null
      })
      .select("id, name, email, role")
      .single();

    setIsSaving(false);
    if (error || !data) return;

    const row = data as {
      id: string;
      name: string;
      email: string | null;
      role: string | null;
    };
    setContributors((prev) => [
      ...prev,
      {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role
      }
    ]);
    const msg = emailTrim
      ? `Team member added · Invite sent to ${emailTrim}`
      : "Team member added";
    showToast(msg);
    closeCreateForm();
  }, [
    closeCreateForm,
    emailDraft,
    isSaving,
    nameDraft,
    projectId,
    roleDraft,
    showToast
  ]);

  const onFormKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void saveNewContributor();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeCreateForm();
    }
  };

  const removeContributor = useCallback(
    async (c: ProjectContributor) => {
      setContributors((prev) => prev.filter((x) => x.id !== c.id));
      undoContributorSnapshotRef.current = c;
      setUndoToast({ key: Date.now() });

      const supabase = createSupabaseBrowserClient();
      await supabase.from("contributors").delete().eq("id", c.id);
    },
    []
  );

  const undoRemoveContributor = useCallback(async () => {
    const snap = undoContributorSnapshotRef.current;
    if (!snap) return;
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("contributors")
      .insert({
        project_id: projectId,
        name: snap.name,
        email: snap.email,
        role: snap.role
      })
      .select("id, name, email, role")
      .single();

    if (error || !data) return;

    const row = data as {
      id: string;
      name: string;
      email: string | null;
      role: string | null;
    };
    setContributors((prev) => [
      ...prev,
      {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role
      }
    ]);
    undoContributorSnapshotRef.current = null;
  }, [projectId]);

  const showEmptyState = contributors.length === 0 && mode === "idle";

  return (
    <section>
      <h2 className={sectionHeadingClass} style={sectionHeadingStyle}>
        Team Members
      </h2>
      {showEmptyState ? (
        <div
          className="mt-3 flex w-full flex-col items-center justify-center border border-solid border-[#e4ddd3]"
          style={{
            borderRadius: 6,
            minHeight: 100,
            gap: 8,
            backgroundColor: "#f3efe9",
            padding: 32
          }}
        >
          <p className="m-0 text-[12px] font-normal leading-[1.5] text-[#998c82]">
            No team members added yet.
          </p>
          <Button
            type="button"
            variant="ghost"
            label="Add contributor"
            icon="leading"
            iconName="plus"
            size="sm"
            onClick={() => {
              setMode("search");
              setSearchQuery("");
            }}
          />
        </div>
      ) : null}
      {contributors.length > 0 ? (
        <div className="mt-3 flex flex-wrap" style={{ gap: 4 }}>
          {contributors.map((c) => (
            <div
              key={c.id}
              className="group flex h-8 max-w-full min-w-0 items-center border border-solid border-[#e4ddd3] bg-[#f3efe9] px-2 transition-all duration-150 ease-in-out hover:border-[#e8d0d4] hover:bg-[#f5eaec]"
              style={{
                borderRadius: 4,
                gap: 8
              }}
            >
              {/* TODO: replace with real avatar when auth is implemented */}
              <span
                className="shrink-0 rounded-full"
                style={{
                  width: 24,
                  height: 24,
                  backgroundColor: "#e4ddd3"
                }}
                aria-hidden
              />
              <span
                className="min-w-0 truncate text-[12px] font-medium leading-[1.5] text-[#6b5e55] transition-colors duration-150 group-hover:text-[#6b1e2e]"
                style={{ letterSpacing: "0.24px" }}
                title={c.name}
              >
                {c.name}
              </span>
              {c.role ? (
                <span
                  className="shrink-0 rounded-[4px] border-0 text-[10px] font-semibold uppercase leading-[1.5] text-[#6b5e55]"
                  style={{
                    backgroundColor: "#e4ddd3",
                    padding: "2px 6px"
                  }}
                >
                  {c.role}
                </span>
              ) : null}
              <div className="flex h-8 w-6 shrink-0 items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <button
                  type="button"
                  className="flex items-center justify-center border-0 bg-transparent p-0 opacity-100 text-[#998c82] transition-opacity hover:text-[#6b1e2e]"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => void removeContributor(c)}
                >
                  <span className="inline-flex text-current">
                    <Icon name="close" size={14} />
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {toast ? (
        <FixedToastPortal
          key={toast.key}
          message={toast.message}
          onDone={dismissToast}
        />
      ) : null}
      {undoToast ? (
        <UndoToastPortal
          key={undoToast.key}
          message="Team member removed"
          onUndo={undoRemoveContributor}
          onDone={dismissUndoToast}
        />
      ) : null}

      <div ref={flowRef} className="mt-3 flex w-full min-w-0 flex-col gap-2">
        {!showEmptyState ? (
          <Button
            type="button"
            variant="ghost"
            label="Add contributor"
            icon="leading"
            iconName="plus"
            size="sm"
            className="self-start"
            onClick={() => {
              setMode("search");
              setSearchQuery("");
            }}
          />
        ) : null}

        {mode === "search" ? (
          <div className="relative w-full">
            <Input
              ref={searchInputRef}
              type="text"
              label="Search contributors"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="sm"
              showHelper={false}
              className="w-full"
              aria-controls="contributor-search-results"
              aria-autocomplete="list"
            />
            <div
              id="contributor-search-results"
              className="absolute left-0 right-0 z-30 mt-1 overflow-hidden border border-solid bg-white"
              style={{
                borderColor: "#e4ddd3",
                borderRadius: 8,
                boxShadow: "0px 4px 12px rgba(41,33,28,0.12)",
                maxHeight: 280,
                overflowY: "auto"
              }}
              role="listbox"
            >
              {searchMatches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-center gap-3 border-0 bg-transparent px-3 text-left transition-colors duration-150 hover:bg-[#f3efe9]"
                  style={{ height: 36, paddingLeft: 12, paddingRight: 12 }}
                  onClick={() => void addContributorClone(c)}
                >
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor: "#e4ddd3"
                    }}
                    aria-hidden
                  />
                  <span
                    className="min-w-0 truncate text-[13px] font-medium leading-[1.5] text-[#2e1c1c]"
                  >
                    {c.name}
                  </span>
                  <span
                    className="ml-auto min-w-0 truncate text-[12px] font-normal leading-[1.5] text-[#998c82]"
                  >
                    {c.email ?? ""}
                  </span>
                </button>
              ))}
              <Button
                type="button"
                variant="ghost"
                label="Create new team member"
                icon="leading"
                iconName="plus-circle"
                className="w-full justify-start rounded-none border-t border-solid border-[#ede8e0] !px-3 !py-0 !h-9"
                onClick={() => {
                  setMode("create");
                  setSearchQuery("");
                }}
              />
            </div>
          </div>
        ) : null}

        {mode === "create" ? (
          <div
            className="flex w-full min-w-0 flex-wrap items-center"
            style={{ gap: 8 }}
            onKeyDown={onFormKeyDown}
          >
            <Input
              ref={nameInputRef}
              type="text"
              label="Name"
              placeholder="Name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              disabled={isSaving}
              size="sm"
              showHelper={false}
              className="min-w-0 flex-[1_1_120px]"
            />
            <Input
              type="email"
              label="Email"
              placeholder="Email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              disabled={isSaving}
              size="sm"
              showHelper={false}
              className="min-w-0 flex-[1_1_120px]"
            />
            <RoleSelect
              value={roleDraft}
              onChange={setRoleDraft}
              disabled={isSaving}
              aria-label="Contributor role"
            />
            <div className="flex shrink-0 items-center gap-3">
              <Button
                type="button"
                variant="accent"
                label="Add"
                size="sm"
                disabled={isSaving}
                onClick={() => void saveNewContributor()}
              />
              <Button
                type="button"
                variant="ghost"
                label="Cancel"
                size="sm"
                onClick={closeCreateForm}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
