"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Button,
  Icon,
  Input,
  Modal,
  Select,
  TextareaAi,
  Tooltip,
} from "@/components/ui/ds";
import { generateArtifactDescription } from "@/app/actions/generateArtifactDescription";
import {
  ACCEPTED_MIME_TYPES,
  formatFileSize,
  resolveBaseTypeFromFile,
  type ArtifactModalInitialValues,
  type ArtifactModalSavePayload,
} from "@/components/artifact-modals/artifactModalShared";

type DraftState = {
  title: string;
  versionNumber: number;
  versionCeiling: number;
  description: string;
  file: File | null;
};

function emptyDraft(defaultTitle: string): DraftState {
  return {
    title: defaultTitle,
    versionNumber: 1,
    versionCeiling: 10,
    description: "",
    file: null,
  };
}

function draftFromInitial(initial: ArtifactModalInitialValues, defaultTitle: string): DraftState {
  return {
    title: initial.title ?? defaultTitle,
    versionNumber: initial.versionNumber ?? 1,
    versionCeiling: Math.max(initial.versionNumber ?? 1, 10),
    description: initial.description ?? "",
    file: initial.file ?? null,
  };
}

export type UploadModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (payload: ArtifactModalSavePayload) => void;
  mode?: "add" | "edit";
  initialValues?: ArtifactModalInitialValues | null;
  defaultTitle?: string;
};

export function UploadModal({
  open,
  onClose,
  onSave,
  mode = "add",
  initialValues = null,
  defaultTitle = "Concept 1",
}: UploadModalProps) {
  const uid = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<DraftState>(emptyDraft(defaultTitle));
  const existingFileNameRef = useRef<string | null>(null);
  const existingFileUrlRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft(defaultTitle));
  const [descriptionGenerating, setDescriptionGenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next =
      mode === "edit" && initialValues
        ? draftFromInitial(initialValues, defaultTitle)
        : emptyDraft(defaultTitle);
    draftRef.current = next;
    existingFileNameRef.current = initialValues?.originalFileName ?? null;
    existingFileUrlRef.current = initialValues?.fileUrl ?? null;
    setDraft(next);
    setDescriptionGenerating(false);
  }, [open, mode, initialValues, defaultTitle]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const versionOk = draft.versionNumber >= 1 && draft.versionNumber <= draft.versionCeiling;
  const hasFile = Boolean(draft.file || existingFileNameRef.current);
  const canSave = hasFile && draft.title.trim().length > 0 && versionOk;

  const versionOptions = useMemo(
    () =>
      Array.from({ length: draft.versionCeiling }, (_, index) => {
        const value = String(index + 1);
        return { value, label: `v${value}` };
      }),
    [draft.versionCeiling],
  );

  async function runDescriptionGeneration() {
    const trimmed = draftRef.current.description.trim();
    if (!trimmed) return;
    setDescriptionGenerating(true);
    try {
      const result = await generateArtifactDescription({ existingContent: trimmed });
      if (!result.ok) return;
      setDraft((prev) => ({ ...prev, description: result.description }));
    } finally {
      setDescriptionGenerating(false);
    }
  }

  function applyFile(file: File) {
    if (!ACCEPTED_MIME_TYPES.split(",").includes(file.type)) return;
    setDraft((prev) => ({
      ...prev,
      file,
      title: prev.title || file.name.replace(/\.[^/.]+$/, "") || file.name,
    }));
  }

  function handleSave() {
    if (!canSave) return;
    const localKey = initialValues?.localKey ?? crypto.randomUUID();
    const file = draft.file;
    const originalFileName = file?.name ?? existingFileNameRef.current;
    onSave({
      localKey,
      canonicalArtifactId: initialValues?.canonicalArtifactId ?? null,
      kind: "file",
      title: draft.title.trim(),
      iterationLabel: `v${draft.versionNumber}`,
      versionNumber: draft.versionNumber,
      description: draft.description.trim(),
      linkUrl: "",
      file,
      fileUrl: file ? null : existingFileUrlRef.current,
      originalFileName,
      baseType: resolveBaseTypeFromFile(
        file,
        originalFileName,
        initialValues?.baseType ?? "Image",
      ),
    });
  }

  const nameFieldId = `${uid}-upload-name`;
  const modalTitle = mode === "edit" ? "Edit Upload" : "Upload Artifact";
  const saveLabel = mode === "edit" ? "Save" : "Add Artifact";
  const displayedFileName = draft.file?.name ?? existingFileNameRef.current;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES}
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) applyFile(file);
        }}
      />
      <Modal
        open={open}
        type="form"
        size="md"
        title={modalTitle}
        onClose={onClose}
        footer={
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              width: "100%",
            }}
          >
            <Button variant="secondary" size="sm" label="Cancel" onClick={onClose} />
            {canSave ? (
              <Button
                variant="primary"
                size="sm"
                label={saveLabel}
                disabled={descriptionGenerating}
                onClick={handleSave}
              />
            ) : (
              <Tooltip
                label={
                  descriptionGenerating
                    ? "Optimising description…"
                    : !hasFile
                      ? "Select a file"
                      : !draft.title.trim()
                        ? "Enter an artifact name"
                        : "Complete all required fields"
                }
                position="top"
              >
                <Button variant="primary" size="sm" label={saveLabel} disabled onClick={() => {}} />
              </Tooltip>
            )}
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              backgroundColor: "#f3efe9",
              border: "2px dashed #c9c0b4",
              borderRadius: 8,
              height: 150,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) applyFile(file);
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="upload" size={20} style={{ color: "#6b5e55" }} />
              <span style={{ fontSize: 14, fontWeight: 500, color: "#6b5e55" }}>
                Drag & drop files here
              </span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#6b5e55" }}>OR</span>
            <Button
              variant="secondary"
              size="sm"
              label="Browse files"
              onClick={() => fileInputRef.current?.click()}
            />
          </div>
          <p
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 12,
              fontWeight: 400,
              lineHeight: 1.5,
              letterSpacing: "0.24px",
              color: "#6b5e55",
              margin: 0,
            }}
          >
            You can upload files in the following formats: JPEG, PNG, GIF, WEBP, SVG, and PDF.
          </p>
        </div>

        {displayedFileName ? (
          <p style={{ fontSize: 12, color: "#6b5e55", margin: "8px 0 0" }}>
            {displayedFileName}
            {draft.file ? ` · ${formatFileSize(draft.file.size)}` : null}
          </p>
        ) : null}

        <div className="flex w-full min-w-0 gap-2" style={{ alignItems: "flex-start", marginTop: 12 }}>
          <div className="min-w-0 flex-1">
            <Input
              fieldId={nameFieldId}
              label="Artifact Name"
              required
              size="sm"
              placeholder="e.g. Concept 1"
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            />
          </div>
          <div style={{ width: 120, flexShrink: 0 }}>
            <Select
              label="Version"
              options={versionOptions}
              value={String(draft.versionNumber)}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  versionNumber: parseInt(value, 10) || 1,
                }))
              }
              placeholder="v1"
              size="sm"
              portaled
            />
          </div>
        </div>

        <div className="flex flex-col" style={{ gap: 0, marginTop: 12 }}>
          <TextareaAi
            label="Description"
            size="md"
            variant="form-fixed"
            generating={descriptionGenerating}
            hideIdleAiFooter
            placeholder={
              descriptionGenerating ? "Optimising description…" : "Describe what this design shows"
            }
            value={draft.description}
            onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
            showLoadingButton={descriptionGenerating}
            showAiButton={false}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 6,
              width: "100%",
              marginTop: 6,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }} aria-hidden />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              label="Optimise with Ai"
              icon="leading"
              iconName="ai-stars"
              style={{ flexShrink: 0 }}
              disabled={descriptionGenerating || !draft.description.trim()}
              onClick={() => {
                void runDescriptionGeneration();
              }}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
