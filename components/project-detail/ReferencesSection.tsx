"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import { Button, Icon } from "@/components/ui/ds";
import { useToast } from "@/components/Toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadProjectSourceFile } from "@/lib/sources/uploadProjectSourceFile";
import {
  classifySourcePreview,
  useSourcePreview,
} from "@/lib/sources/useSourcePreview";
import { logTimelineEventClient } from "@/lib/timeline/logEventClient";
import type { ProjectReference } from "@/types/project";

const REFERENCE_SELECT =
  "id, project_id, label, url, file_name, storage_path, file_type, created_at";

function sourceTypeForStoragePath(
  storagePath: string | null | undefined
): "file" | "link" {
  return storagePath != null && String(storagePath).trim() !== ""
    ? "file"
    : "link";
}

async function resolveProjectWorkspaceId(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  projectId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .maybeSingle();
  const workspaceId = String(
    (data as { workspace_id?: string | null } | null)?.workspace_id ?? ""
  ).trim();
  return workspaceId === "" ? null : workspaceId;
}

interface ReferencesSectionProps {
  projectId: string;
  initialReferences: ProjectReference[];
  hideAddActions?: boolean;
}

const sectionHeadingClass =
  "text-[20px] font-bold leading-[1.3] text-[#6b1e2e]";

const sectionHeadingStyle = { letterSpacing: "-0.3px" as const };

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
  const { showToast } = useToast();
  const { openSource, preview } = useSourcePreview();
  const [references, setReferences] =
    useState<ProjectReference[]>(initialReferences);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const undoReferenceSnapshotRef = useRef<ProjectReference | null>(null);

  const undoRemoveReference = useCallback(async () => {
    const snap = undoReferenceSnapshotRef.current;
    if (!snap) return;
    const supabase = createSupabaseBrowserClient();
    const workspaceId = await resolveProjectWorkspaceId(supabase, projectId);
    const { data, error } = await supabase
      .from("sources")
      .insert({
        project_id: projectId,
        workspace_id: workspaceId,
        source_type: sourceTypeForStoragePath(snap.storage_path),
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
    void logTimelineEventClient({
      projectId,
      eventType: "source_added",
      payload: {
        source_label: referenceTitle(data as ProjectReference),
        source_type: sourceTypeForStoragePath(
          (data as ProjectReference).storage_path
        ),
      },
    });
  }, [projectId]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIsSaving(true);
    try {
      const data = await uploadProjectSourceFile(projectId, file);
      setReferences((prev) => [...prev, data]);
      void logTimelineEventClient({
        projectId,
        eventType: "source_added",
        payload: {
          source_label: referenceTitle(data),
          source_type: sourceTypeForStoragePath(data.storage_path),
        },
      });
    } catch {
      // uploadProjectSourceFile already logs storage failures; DB failures stay silent
    } finally {
      setIsSaving(false);
    }
  }

  async function removeReference(row: ProjectReference) {
    setReferences((refs) => refs.filter((r) => r.id !== row.id));
    undoReferenceSnapshotRef.current = row;
    showToast({
      message: "Source file removed",
      sentiment: "success",
      actionLabel: "Undo",
      onAction: () => {
        void undoRemoveReference();
      },
    });

    const supabase = createSupabaseBrowserClient();

    if (row.storage_path) {
      await supabase.storage
        .from("project-references")
        .remove([row.storage_path]);
    }

    const { error } = await supabase
      .from("sources")
      .delete()
      .eq("id", row.id);

    if (error) {
      undoReferenceSnapshotRef.current = null;
      setReferences((refs) => {
        if (refs.some((r) => r.id === row.id)) return refs;
        return [...refs, row].sort((a, b) =>
          a.created_at.localeCompare(b.created_at)
        );
      });
      return;
    }

    void logTimelineEventClient({
      projectId,
      eventType: "source_deleted",
      payload: {
        source_label: referenceTitle(row),
        source_type: sourceTypeForStoragePath(row.storage_path),
      },
    });
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
            const previewKind = classifySourcePreview(row);
            const isFile = previewKind === "file";
            const isUrl = previewKind === "link";

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
                  onClick={() => openSource(row)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      openSource(row);
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

      {preview}
    </section>
  );
}
