"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, Icon, Menu, MenuItem, Modal, Textarea, Tooltip } from "@/components/ui/ds";
import { useToast } from "@/components/Toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { logTimelineEventClient } from "@/lib/timeline/logEventClient";
import type { ProjectProblem } from "@/types/project";

const sectionHeadingClass =
  "text-[20px] font-semibold leading-[1.3] text-[#6b1e2e]";

const sectionHeadingStyle = { letterSpacing: "-0.3px" as const };

const PLACEHOLDER =
  "Who feels what, about what, and faces what obstacle?";

type ProblemsSectionProps = {
  projectId: string;
  initialProblems: ProjectProblem[];
  hideAddActions?: boolean;
};

export function ProblemsSection({
  projectId,
  initialProblems,
  hideAddActions = false,
}: ProblemsSectionProps) {
  const { showToast } = useToast();
  const [problems, setProblems] = useState<ProjectProblem[]>(initialProblems);
  const [problemModalOpen, setProblemModalOpen] = useState(false);
  const [newProblemText, setNewProblemText] = useState("");
  const [editingProblem, setEditingProblem] = useState<ProjectProblem | null>(null);
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [openKebabId, setOpenKebabId] = useState<string | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (openKebabId === null) return;
    const handlePointerDown = (event: PointerEvent) => {
      const anchor = menuRefs.current[openKebabId];
      if (!anchor?.contains(event.target as Node)) {
        setOpenKebabId(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openKebabId]);

  const closeModal = () => {
    setProblemModalOpen(false);
    setEditingProblem(null);
    setEditText("");
    setNewProblemText("");
  };

  const onAddProblem = async (description: string) => {
    if (isSaving) return;
    setIsSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("problems")
      .insert({ project_id: projectId, description })
      .select("id, description")
      .single();
    setIsSaving(false);
    if (error || !data) return;
    setProblems((prev) => [...prev, data as ProjectProblem]);
    await logTimelineEventClient({
      projectId,
      eventType: "problem_added",
      payload: { problem_text: description }
    });
    showToast("Changes saved");
  };

  const onUpdateProblem = async (problemId: string, description: string) => {
    if (isSaving) return;
    setIsSaving(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("problems")
      .update({ description })
      .eq("id", problemId)
      .select("id, description")
      .single();
    setIsSaving(false);
    if (error || !data) return;
    setProblems((prev) =>
      prev.map((p) =>
        p.id === problemId
          ? { ...p, description: (data as ProjectProblem).description }
          : p
      )
    );
    await logTimelineEventClient({
      projectId,
      eventType: "problem_edited",
      payload: { problem_text: description }
    });
    showToast("Changes saved");
  };

  const onDeleteProblem = async (problemId: string) => {
    setProblems((prev) => prev.filter((problem) => problem.id !== problemId));
    setOpenKebabId(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("problems").delete().eq("id", problemId);
    if (!error) showToast("Changes saved");
  };

  return (
    <section className="w-full min-w-0 flex flex-col gap-3">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 className={sectionHeadingClass} style={sectionHeadingStyle}>
          Problems
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "#6b5e55", fontWeight: 400 }}>
          Problem statements related to this project are later tied to reviews.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {problems.map((problem) => {
          const showHover = hoveredRowId === problem.id;
          return (
            <div
              key={problem.id}
              onMouseEnter={() => setHoveredRowId(problem.id)}
              onMouseLeave={() => setHoveredRowId((prev) => (prev === problem.id ? null : prev))}
              style={{
                height: 40,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 4,
                paddingBottom: 4,
                borderRadius: 4,
                border: `1px solid ${showHover ? "#e8d0d4" : "#e4ddd3"}`,
                backgroundColor: showHover ? "#f5eaec" : "#f3efe9",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: showHover ? "#6b1e2e" : "#6b5e55",
                  lineHeight: 1.5,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {problem.description}
              </span>
              {showHover && (
                <div
                  ref={(node) => {
                    menuRefs.current[problem.id] = node;
                  }}
                  style={{ position: "relative" }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenKebabId((current) => (current === problem.id ? null : problem.id))
                    }
                    aria-label="More options"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      color: "#6b1e2e",
                      padding: 0,
                    }}
                  >
                    <Icon name="kebab" size={14} />
                  </button>
                  <Menu
                    open={openKebabId === problem.id}
                    onClose={() => setOpenKebabId(null)}
                    anchorRef={{
                      current: menuRefs.current[problem.id] as HTMLDivElement | null,
                    }}
                    align="right"
                  >
                    <MenuItem
                      label="Edit"
                      onClick={() => {
                        setEditingProblem(problem);
                        setEditText(problem.description);
                        setProblemModalOpen(true);
                        setOpenKebabId(null);
                      }}
                    />
                    <MenuItem
                      label="Delete"
                      onClick={() => {
                        void onDeleteProblem(problem.id);
                        setOpenKebabId(null);
                      }}
                    />
                  </Menu>
                </div>
              )}
            </div>
          );
        })}

        {problems.length === 0 && (
          <div
            style={{
              backgroundColor: "#f3efe9",
              border: "1px solid #e4ddd3",
              borderRadius: 8,
              height: 68,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: "#998c82" }}>
              No problems have been linked to this project.
            </span>
          </div>
        )}
      </div>

      {!hideAddActions ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            label="Create a new problem"
            icon="leading"
            iconName="plus"
            size="sm"
            onClick={() => {
              setEditingProblem(null);
              setEditText("");
              setNewProblemText("");
              setProblemModalOpen(true);
            }}
          />
        </div>
      ) : null}

      <Modal
        open={problemModalOpen}
        type="form"
        size="md"
        title={editingProblem ? "Edit the problem" : "Create a new problem"}
        onClose={closeModal}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, width: "100%" }}>
            <Button
              variant="secondary"
              size="sm"
              label="Cancel"
              onClick={() => {
                setProblemModalOpen(false);
                setEditingProblem(null);
              }}
            />
            {editingProblem ? (
              !editText.trim() || isSaving ? (
                <Tooltip
                  label={isSaving ? "Please wait…" : "Add a description to continue"}
                >
                  <span style={{ display: "inline-flex" }}>
                    <Button
                      variant="primary"
                      size="sm"
                      label="Save"
                      disabled
                      aria-disabled
                    />
                  </span>
                </Tooltip>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  label="Save"
                  onClick={() => {
                    const value = editText.trim();
                    if (!value) return;
                    void onUpdateProblem(editingProblem.id, value).then(() => {
                      setProblemModalOpen(false);
                      setEditingProblem(null);
                      setEditText("");
                    });
                  }}
                />
              )
            ) : !newProblemText.trim() || isSaving ? (
              <Tooltip
                label={isSaving ? "Please wait…" : "Add a description to continue"}
              >
                <span style={{ display: "inline-flex" }}>
                  <Button variant="accent" size="sm" label="Create" disabled aria-disabled />
                </span>
              </Tooltip>
            ) : (
              <Button
                variant="accent"
                size="sm"
                label="Create"
                onClick={() => {
                  const value = newProblemText.trim();
                  if (!value) return;
                  void onAddProblem(value).then(() => {
                    setProblemModalOpen(false);
                    setNewProblemText("");
                  });
                }}
              />
            )}
          </div>
        }
      >
        <Textarea
          label="Describe the problem or assumption that has been identified"
          showLabel
          size="md"
          variant="form-fixed"
          placeholder={PLACEHOLDER}
          value={editingProblem ? editText : newProblemText}
          onChange={(event) =>
            editingProblem
              ? setEditText(event.target.value)
              : setNewProblemText(event.target.value)
          }
        />
      </Modal>
    </section>
  );
}
