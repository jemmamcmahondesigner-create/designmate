"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import { createPortal } from "react-dom";
import { Button, Icon } from "@/components/ui/ds";
import { SourceFileViewer } from "@/components/project-detail/SourceFileViewer";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProjectReference } from "@/types/project";

const REFERENCE_SELECT =
  "id, project_id, label, url, file_name, storage_path, file_type, created_at";

function deriveFileType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["xlsx", "xls", "csv"].includes(ext)) return "spreadsheet";
  if (["doc", "docx", "txt"].includes(ext)) return "document";
  return "other";
}

interface ReferencesSectionProps {
  projectId: string;
  initialReferences: ProjectReference[];
  hideAddActions?: boolean;
}

const sectionHeadingClass =
  "text-[20px] font-bold leading-[1.3] text-[#6b1e2e]";

const sectionHeadingStyle = { letterSpacing: "-0.3px" as const };

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
        boxShadow: "0px 4px 12px rgba(41,33,28,0.12)",
        fontSize: 13,
        fontWeight: 500,
        color: "#256b38",
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

function referenceTitle(row: ProjectReference): string {
  if (row.label && row.label.trim() !== "") {
    return row.label.trim();
  }
  if (row.file_name) {
    return row.file_name;
  }
  return "Untitled";
}

export function ReferencesSection({
  projectId,
  initialReferences,
  hideAddActions = false,
}: ReferencesSectionProps) {
  const [references, setReferences] =
    useState<ProjectReference[]>(initialReferences);
  const [isSaving, setIsSaving] = useState(false);
  const [undoToast, setUndoToast] = useState<{ key: number } | null>(null);
  const [viewingRef, setViewingRef] = useState<ProjectReference | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const undoReferenceSnapshotRef = useRef<ProjectReference | null>(null);

  const dismissUndoToast = useCallback(() => {
    undoReferenceSnapshotRef.current = null;
    setUndoToast(null);
  }, []);

  const undoRemoveReference = useCallback(async () => {
    const snap = undoReferenceSnapshotRef.current;
    if (!snap) return;
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("project_references")
      .insert({
        project_id: projectId,
        label: snap.label,
        url: snap.url,
        file_name: snap.file_name,
        storage_path: snap.storage_path,
        file_type: snap.file_type,
      })
      .select(REFERENCE_SELECT)
      .single();

    if (error || !data) return;

    setReferences((prev) => [...prev, data as ProjectReference]);
    undoReferenceSnapshotRef.current = null;
  }, [projectId]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIsSaving(true);
    const supabase = createSupabaseBrowserClient();

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("project-references")
      .upload(storagePath, file, { upsert: false });

    if (uploadError) {
      console.error("Upload failed:", uploadError.message);
      setIsSaving(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("project-references")
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    const { data, error: dbError } = await supabase
      .from("project_references")
      .insert({
        project_id: projectId,
        label: file.name,
        url: publicUrl,
        file_name: file.name,
        storage_path: storagePath,
        file_type: deriveFileType(file.name),
      })
      .select(REFERENCE_SELECT)
      .single();

    setIsSaving(false);
    if (!dbError && data) {
      setReferences((prev) => [...prev, data as ProjectReference]);
    }
  }

  async function removeReference(row: ProjectReference) {
    setReferences((refs) => refs.filter((r) => r.id !== row.id));
    undoReferenceSnapshotRef.current = row;
    setUndoToast({ key: Date.now() });

    const supabase = createSupabaseBrowserClient();

    if (row.storage_path) {
      await supabase.storage
        .from("project-references")
        .remove([row.storage_path]);
    }

    const { error } = await supabase
      .from("project_references")
      .delete()
      .eq("id", row.id);

    if (error) {
      undoReferenceSnapshotRef.current = null;
      setUndoToast(null);
      setReferences((refs) => {
        if (refs.some((r) => r.id === row.id)) return refs;
        return [...refs, row].sort((a, b) =>
          a.created_at.localeCompare(b.created_at)
        );
      });
    }
  }

  const showEmptyState = references.length === 0;

  return (
    <section>
      <h2 className={sectionHeadingClass} style={sectionHeadingStyle}>
        Source Files
      </h2>

      {showEmptyState ? (
        <>
          <div
            className="mt-3 flex w-full items-center justify-center border border-solid border-[#e4ddd3]"
            style={{
              borderRadius: 8,
              height: 66,
              backgroundColor: "#f3efe9",
            }}
          >
            <p
              className="m-0 px-4 text-center text-[14px] font-medium leading-[1.5]"
              style={{
                color: "var(--text-tertiary, #998c82)",
              }}
            >
              No source files added yet.
            </p>
          </div>
          {!hideAddActions ? (
            <div className="mt-2">
              <Button
                type="button"
                variant="ghost"
                label="Add source"
                icon="leading"
                iconName="plus"
                size="sm"
                disabled={isSaving}
                onClick={() => fileInputRef.current?.click()}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {references.length > 0 ? (
        <div className="mt-3 flex flex-wrap" style={{ gap: 6 }}>
          {references.map((row) => {
            const title = referenceTitle(row);
            const isFile = row.storage_path != null;
            const isUrl = row.url != null && row.storage_path == null;

            const chipContent = (
              <>
                <div
                  className={`relative z-0 flex min-w-0 flex-1 items-center gap-2 overflow-hidden ${isFile ? "cursor-pointer" : isUrl ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span className="inline-flex shrink-0 text-[#6b5e55]">
                    <Icon name="link" size={16} />
                  </span>
                  <span
                    className="min-w-0 truncate text-[12px] font-medium leading-[1.5] text-[#6b5e55] transition-colors duration-150 group-hover:text-[#6b1e2e]"
                    style={{ letterSpacing: "0.24px" }}
                    title={title}
                  >
                    {title}
                  </span>
                </div>
                <div className="relative z-10 ml-auto shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <button
                    type="button"
                    className="flex items-center justify-center border-0 bg-transparent p-0 opacity-100 text-[#998c82] hover:text-[#6b1e2e]"
                    aria-label={`Remove ${title}`}
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      void removeReference(row);
                    }}
                  >
                    <span className="inline-flex text-current">
                      <Icon name="close" size={14} />
                    </span>
                  </button>
                </div>
              </>
            );

            const chipClassName =
              "group relative flex h-[28px] max-w-full min-w-0 items-center border border-solid border-[#e4ddd3] bg-[#f3efe9] transition-all duration-150 ease-in-out hover:border-[#e8d0d4] hover:bg-[#f5eaec]";

            if (isFile) {
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className={chipClassName}
                  style={{
                    borderRadius: 4,
                    paddingLeft: 8,
                    paddingRight: 8,
                    gap: 8,
                    cursor: "pointer",
                  }}
                  onClick={() => setViewingRef(row)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setViewingRef(row);
                    }
                  }}
                >
                  {chipContent}
                </div>
              );
            }

            if (isUrl) {
              return (
                <a
                  key={row.id}
                  href={row.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={chipClassName}
                  style={{
                    borderRadius: 4,
                    paddingLeft: 8,
                    paddingRight: 8,
                    gap: 8,
                    textDecoration: "none",
                  }}
                >
                  {chipContent}
                </a>
              );
            }

            return (
              <div
                key={row.id}
                className={chipClassName}
                style={{ borderRadius: 4, paddingLeft: 8, paddingRight: 8, gap: 8 }}
              >
                {chipContent}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className={`flex w-full min-w-0 flex-col gap-2 ${references.length > 0 ? "mt-3" : ""}`}>
        {!showEmptyState && !hideAddActions ? (
          <Button
            type="button"
            variant="ghost"
            label="Add source"
            icon="leading"
            iconName="plus"
            size="sm"
            className="self-start"
            disabled={isSaving}
            onClick={() => fileInputRef.current?.click()}
          />
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          disabled={isSaving}
          onChange={(e) => void handleFileChange(e)}
        />
      </div>

      {undoToast ? (
        <UndoToastPortal
          key={undoToast.key}
          message="Source file removed"
          onUndo={undoRemoveReference}
          onDone={dismissUndoToast}
        />
      ) : null}

      {viewingRef ? (
        <SourceFileViewer
          reference={viewingRef}
          onClose={() => setViewingRef(null)}
        />
      ) : null}
    </section>
  );
}
