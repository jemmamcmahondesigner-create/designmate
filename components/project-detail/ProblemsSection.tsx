"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProjectProblem } from "@/types/project";

const sectionHeadingClass =
  "text-[20px] font-semibold leading-[1.3] text-[#6b1e2e]";

const sectionHeadingStyle = { letterSpacing: "-0.3px" as const };

const PLACEHOLDER =
  "Who feels what, about what, and faces what obstacle?";

const focusRing =
  "outline-none ring-0 focus:outline-none focus:ring-0 focus:border-[#6b1e2e] focus:shadow-[0_0_0_3px_rgba(107,30,46,0.12)]";

const formFieldClass = `w-full min-h-[32px] resize-none overflow-hidden rounded border border-solid border-[#e4ddd3] bg-white px-2 py-1.5 text-[12px] font-medium leading-[1.5] text-[#6b5e55] transition-all duration-150 ease-[ease] placeholder:font-medium placeholder:text-[#998c82] hover:border-[#c9c0b4] ${focusRing}`;

function autosizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

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

type ProblemsSectionProps = {
  projectId: string;
  initialProblems: ProjectProblem[];
};

export function ProblemsSection({
  projectId,
  initialProblems
}: ProblemsSectionProps) {
  const [problems, setProblems] = useState<ProjectProblem[]>(initialProblems);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [menuProblemId, setMenuProblemId] = useState<string | null>(null);
  const [savedToastKey, setSavedToastKey] = useState<number | null>(null);
  const [undoToast, setUndoToast] = useState<{
    key: number;
    snapshot: ProjectProblem;
  } | null>(null);
  const undoProblemSnapshotRef = useRef<ProjectProblem | null>(null);

  const addTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const menuWrappersRef = useRef<Record<string, HTMLDivElement | null>>({});

  useLayoutEffect(() => {
    if (isAdding && addTextareaRef.current) {
      autosizeTextarea(addTextareaRef.current);
    }
  }, [draft, isAdding]);

  useLayoutEffect(() => {
    if (editingId && editTextareaRef.current) {
      autosizeTextarea(editTextareaRef.current);
    }
  }, [editDraft, editingId]);

  useEffect(() => {
    if (isAdding) {
      addTextareaRef.current?.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    if (editingId) {
      editTextareaRef.current?.focus();
    }
  }, [editingId]);

  useEffect(() => {
    if (!menuProblemId) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const wrap = menuWrappersRef.current[menuProblemId];
      if (wrap?.contains(e.target as Node)) return;
      setMenuProblemId(null);
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMenuProblemId(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuProblemId]);

  const showSavedToast = useCallback(() => {
    setSavedToastKey(Date.now());
  }, []);

  const dismissSavedToast = useCallback(() => {
    setSavedToastKey(null);
  }, []);

  const dismissUndoToast = useCallback(() => {
    setUndoToast(null);
  }, []);

  const closeAddForm = useCallback(() => {
    setDraft("");
    setIsAdding(false);
  }, []);

  const closeEditForm = useCallback(() => {
    setEditingId(null);
    setEditDraft("");
  }, []);

  const saveNew = useCallback(async () => {
    const t = draft.trim();
    if (!t || isSaving) return;
    setIsSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("problems")
      .insert({ project_id: projectId, description: t })
      .select("id, description")
      .single();

    setIsSaving(false);
    if (error || !data) return;

    const row = data as { id: string; description: string };
    setProblems((prev) => [...prev, { id: row.id, description: row.description }]);
    setDraft("");
    setIsAdding(false);
    showSavedToast();
  }, [draft, isSaving, projectId, showSavedToast]);

  const saveEdit = useCallback(async () => {
    const id = editingId;
    const t = editDraft.trim();
    if (!id || !t || isSaving) return;
    setIsSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("problems")
      .update({ description: t })
      .eq("id", id)
      .select("id, description")
      .single();

    setIsSaving(false);
    if (error || !data) return;

    const row = data as { id: string; description: string };
    setProblems((prev) =>
      prev.map((p) => (p.id === row.id ? { ...p, description: row.description } : p))
    );
    closeEditForm();
    showSavedToast();
  }, [closeEditForm, editDraft, editingId, isSaving, showSavedToast]);

  const deleteProblem = useCallback(
    async (snapshot: ProjectProblem) => {
      setProblems((prev) => prev.filter((x) => x.id !== snapshot.id));
      setMenuProblemId(null);
      if (editingId === snapshot.id) closeEditForm();
      undoProblemSnapshotRef.current = snapshot;
      setUndoToast({ key: Date.now(), snapshot });

      const supabase = createSupabaseBrowserClient();
      await supabase.from("problems").delete().eq("id", snapshot.id);
    },
    [closeEditForm, editingId]
  );

  const undoDeleteProblem = useCallback(async () => {
    const snap = undoProblemSnapshotRef.current;
    if (!snap) return;
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("problems")
      .insert({
        project_id: projectId,
        description: snap.description
      })
      .select("id, description")
      .single();

    if (error || !data) return;

    const row = data as { id: string; description: string };
    setProblems((prev) => [...prev, { id: row.id, description: row.description }]);
    undoProblemSnapshotRef.current = null;
  }, [projectId]);

  const showEmptyState = problems.length === 0 && !isAdding;

  return (
    <section className="w-full min-w-0">
      <h2 className={sectionHeadingClass} style={sectionHeadingStyle}>
        Problems
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
            No problems added yet.
          </p>
          <Button
            type="button"
            variant="ghost"
            label="Add problem"
            icon="leading"
            iconName="plus"
            size="sm"
            onClick={() => {
              setEditingId(null);
              setEditDraft("");
              setIsAdding(true);
            }}
          />
        </div>
      ) : null}
      {problems.length > 0 ? (
        <ul className="mt-3 flex w-full list-none flex-col p-0" style={{ gap: 8 }}>
          {problems.map((p) => (
            <li key={p.id} className="w-full">
              {editingId === p.id ? (
                <div className="w-full">
                  <div className="flex w-full min-w-0 flex-wrap items-start gap-2">
                    <textarea
                      ref={editTextareaRef}
                      value={editDraft}
                      rows={1}
                      disabled={isSaving}
                      onChange={(e) => {
                        setEditDraft(e.target.value);
                        autosizeTextarea(e.target);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void saveEdit();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          closeEditForm();
                        }
                      }}
                      className={formFieldClass}
                      style={{
                        flex: "1 1 calc(100% - 180px)",
                        minWidth: 0,
                        borderRadius: 4,
                        letterSpacing: "0.24px"
                      }}
                      aria-label="Edit problem"
                    />
                    <div className="flex h-7 shrink-0 items-center gap-2 self-start pt-0.5">
                      <Button
                        type="button"
                        variant="accent"
                        label="Save"
                        size="sm"
                        className="!h-7"
                        disabled={isSaving}
                        onClick={() => void saveEdit()}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        label="Cancel"
                        size="sm"
                        className="ml-2"
                        onClick={closeEditForm}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="group relative flex min-h-[32px] w-full items-start border border-solid border-[#e4ddd3] bg-[#f3efe9] px-2 py-1 transition-all duration-150 ease-in-out hover:border-[#e8d0d4] hover:bg-[#f5eaec]"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    minHeight: 32,
                    gap: 8,
                    borderRadius: 4
                  }}
                >
                  <span
                    className="min-w-0 flex-1 whitespace-normal break-words text-[12px] font-medium leading-[1.5] text-[#6b5e55] transition-colors duration-150 group-hover:text-[#6b1e2e]"
                    style={{
                      flex: 1,
                      letterSpacing: "0.24px",
                      wordBreak: "break-word"
                    }}
                  >
                    {p.description}
                  </span>
                  <div
                    ref={(el) => {
                      menuWrappersRef.current[p.id] = el;
                    }}
                    className="relative shrink-0"
                    style={{ flexShrink: 0, alignSelf: "center" }}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      iconOnly
                      icon="leading"
                      iconName="dots-three-vertical"
                      label="Problem actions"
                      aria-label="Problem actions"
                      aria-expanded={menuProblemId === p.id}
                      aria-haspopup="menu"
                      className="!h-6 !min-w-[24px] !w-6 !p-0"
                      onClick={() =>
                        setMenuProblemId((id) => (id === p.id ? null : p.id))
                      }
                    />
                    {menuProblemId === p.id ? (
                      <div
                        className="absolute right-0 z-30 min-w-[160px] overflow-hidden border border-solid bg-white"
                        style={{
                          top: "100%",
                          marginTop: 4,
                          borderColor: "#e4ddd3",
                          borderRadius: 8,
                          boxShadow: "0px 4px 12px rgba(41,33,28,0.12)"
                        }}
                        role="menu"
                      >
                        <Button
                          type="button"
                          role="menuitem"
                          variant="ghost"
                          label="Edit"
                          icon="leading"
                          iconName="pencil-simple"
                          className="w-full justify-start !rounded-none !px-3 !py-2"
                          onClick={() => {
                            setMenuProblemId(null);
                            setIsAdding(false);
                            setEditingId(p.id);
                            setEditDraft(p.description);
                          }}
                        />
                        <Button
                          type="button"
                          role="menuitem"
                          variant="destructive"
                          label="Delete"
                          icon="leading"
                          iconName="trash"
                          className="destructive w-full justify-start !rounded-none !px-3 !py-2"
                          onClick={() => void deleteProblem(p)}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex w-full min-w-0 flex-col gap-2">
        {!showEmptyState ? (
          <Button
            type="button"
            variant="ghost"
            label="Add problem"
            icon="leading"
            iconName="plus"
            size="sm"
            className="self-start"
            onClick={() => {
              setEditingId(null);
              setEditDraft("");
              setIsAdding(true);
            }}
          />
        ) : null}
        {isAdding ? (
          <div className="w-full min-w-0">
            <div className="flex w-full min-w-0 flex-wrap items-start gap-2">
              <textarea
                ref={addTextareaRef}
                value={draft}
                placeholder={PLACEHOLDER}
                disabled={isSaving}
                rows={1}
                onChange={(e) => {
                  setDraft(e.target.value);
                  autosizeTextarea(e.target);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void saveNew();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    closeAddForm();
                  }
                }}
                className={formFieldClass}
                style={{
                  flex: "1 1 calc(100% - 180px)",
                  minWidth: 0,
                  borderRadius: 4,
                  letterSpacing: "0.24px"
                }}
                aria-label="New problem"
              />
              <div className="flex h-7 shrink-0 items-center gap-2 self-start pt-0.5">
                <Button
                  type="button"
                  variant="accent"
                  label="Add"
                  size="sm"
                  className="!h-7"
                  disabled={isSaving}
                  onClick={() => void saveNew()}
                />
                <Button
                  type="button"
                  variant="ghost"
                  label="Cancel"
                  size="sm"
                  className="ml-2"
                  onClick={closeAddForm}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {savedToastKey != null ? (
        <FixedToastPortal
          key={savedToastKey}
          message="Problem saved"
          onDone={dismissSavedToast}
        />
      ) : null}
      {undoToast ? (
        <UndoToastPortal
          key={undoToast.key}
          message="Problem deleted"
          onUndo={undoDeleteProblem}
          onDone={dismissUndoToast}
        />
      ) : null}
    </section>
  );
}
