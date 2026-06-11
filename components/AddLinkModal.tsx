"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Button,
  Icon,
  IconSquareButton,
  Input,
  Modal,
  Select,
  TextareaAi,
  Tooltip,
} from "@/components/ui/ds";
import { generateArtifactDescription } from "@/app/actions/generateArtifactDescription";
import {
  buildFigmaEmbedUrl,
  isFigmaUrl,
  isValidHttpUrl,
  parseFigmaFrameNameFromOembedTitle,
  type ArtifactModalInitialValues,
  type ArtifactModalSavePayload,
} from "@/components/artifact-modals/artifactModalShared";

type DraftState = {
  linkUrl: string;
  title: string;
  versionNumber: number;
  versionCeiling: number;
  description: string;
};

function emptyDraft(defaultTitle: string): DraftState {
  return {
    linkUrl: "",
    title: defaultTitle,
    versionNumber: 1,
    versionCeiling: 10,
    description: "",
  };
}

function draftFromInitial(initial: ArtifactModalInitialValues, defaultTitle: string): DraftState {
  return {
    linkUrl: initial.linkUrl ?? "",
    title: initial.title ?? defaultTitle,
    versionNumber: initial.versionNumber ?? 1,
    versionCeiling: Math.max(initial.versionNumber ?? 1, 10),
    description: initial.description ?? "",
  };
}

export type AddLinkModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (payload: ArtifactModalSavePayload) => void;
  mode?: "add" | "edit";
  initialValues?: ArtifactModalInitialValues | null;
  defaultTitle?: string;
};

export function AddLinkModal({
  open,
  onClose,
  onSave,
  mode = "add",
  initialValues = null,
  defaultTitle = "Concept 1",
}: AddLinkModalProps) {
  const uid = useId();
  const draftRef = useRef<DraftState>(emptyDraft(defaultTitle));
  const [draft, setDraft] = useState<DraftState>(emptyDraft(defaultTitle));
  const [descriptionGenerating, setDescriptionGenerating] = useState(false);
  const titleEditedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    titleEditedRef.current = mode === "edit";
    const next =
      mode === "edit" && initialValues
        ? draftFromInitial(initialValues, defaultTitle)
        : emptyDraft(defaultTitle);
    draftRef.current = next;
    setDraft(next);
    setDescriptionGenerating(false);
  }, [open, mode, initialValues, defaultTitle]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const versionOk = draft.versionNumber >= 1 && draft.versionNumber <= draft.versionCeiling;
  const canSave =
    isValidHttpUrl(draft.linkUrl) && draft.title.trim().length > 0 && versionOk;

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

  function handleUrlBlur() {
    const urlToFetch = draftRef.current.linkUrl.trim();
    if (!isFigmaUrl(urlToFetch)) return;
    const oEmbedUrl = `https://www.figma.com/api/oembed?url=${encodeURIComponent(urlToFetch)}`;
    void fetch(oEmbedUrl)
      .then((response) => response.json())
      .then((data: { title?: string }) => {
        const raw = data?.title?.trim();
        if (!raw) return;
        const frameName = parseFigmaFrameNameFromOembedTitle(raw);
        if (!frameName || titleEditedRef.current) return;
        const currentTitle = draftRef.current.title.trim();
        if (/^Concept \d+$/.test(currentTitle) || currentTitle === "") {
          setDraft((prev) => ({ ...prev, title: frameName }));
        }
      })
      .catch(() => undefined);
  }

  function handleSave() {
    if (!canSave) return;
    const localKey = initialValues?.localKey ?? crypto.randomUUID();
    const linkUrl = draft.linkUrl.trim();
    onSave({
      localKey,
      canonicalArtifactId: initialValues?.canonicalArtifactId ?? null,
      kind: "link",
      title: draft.title.trim(),
      iterationLabel: `v${draft.versionNumber}`,
      versionNumber: draft.versionNumber,
      description: draft.description.trim(),
      linkUrl,
      file: null,
      fileUrl: null,
      originalFileName: null,
      baseType: linkUrl.toLowerCase().includes("figma.com") ? "Figma" : "Image",
    });
  }

  const linkFieldId = `${uid}-link-url`;
  const nameFieldId = `${uid}-link-name`;
  const modalTitle = mode === "edit" ? "Edit Link" : "Add Link";
  const saveLabel = mode === "edit" ? "Save" : "Add Artifact";

  return (
    <Modal
      open={open}
      type="form"
      size="lg"
      title={modalTitle}
      dialogStyle={{ width: 800, maxWidth: "calc(100vw - 48px)" }}
      footerNoPadding
      onClose={onClose}
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            width: "100%",
            minWidth: 0,
            alignSelf: "stretch",
            borderTop: "1px solid var(--border-subtle, #ede8e0)",
            padding: "16px 24px",
            boxSizing: "border-box",
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
                  : !isValidHttpUrl(draft.linkUrl.trim())
                    ? "Enter a valid URL"
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
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          width: "calc(100% + 48px)",
          marginLeft: -24,
          marginRight: -24,
          marginTop: -20,
          marginBottom: -20,
          flex: "1 1 auto",
          minHeight: 400,
          alignSelf: "stretch",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "50%",
            alignSelf: "stretch",
            borderRight: "1px solid var(--border-subtle, #ede8e0)",
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              position: "relative",
              background: "transparent",
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            {isFigmaUrl(draft.linkUrl) ? (
              <iframe
                src={buildFigmaEmbedUrl(draft.linkUrl)}
                width="100%"
                height="100%"
                style={{ border: "none", display: "block" }}
                allowFullScreen
                title="Figma preview"
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="artifact" size={64} style={{ opacity: 0.35, color: "var(--text-tertiary)" }} />
              </div>
            )}
            {isFigmaUrl(draft.linkUrl) ? (
              <div style={{ position: "absolute", top: 10, right: 10 }}>
                <IconSquareButton
                  icon="trash"
                  label="Clear link"
                  variant="ghost"
                  onClick={() => setDraft((prev) => ({ ...prev, linkUrl: "" }))}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            width: "50%",
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
          }}
        >
          <Input
            fieldId={linkFieldId}
            label="Link URL"
            required
            size="sm"
            placeholder="http://"
            value={draft.linkUrl}
            onChange={(event) => setDraft((prev) => ({ ...prev, linkUrl: event.target.value }))}
            onBlur={handleUrlBlur}
            error={draft.linkUrl.length > 0 && !isValidHttpUrl(draft.linkUrl)}
            errorMessage="Please enter a valid URL"
          />
          <div className="flex w-full min-w-0 gap-2" style={{ alignItems: "flex-start" }}>
            <div className="min-w-0 flex-1">
              <Input
                fieldId={nameFieldId}
                label="Artifact Name"
                required
                size="sm"
                placeholder="e.g. Concept 1"
                value={draft.title}
                onChange={(event) => {
                  titleEditedRef.current = true;
                  setDraft((prev) => ({ ...prev, title: event.target.value }));
                }}
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
          <div className="flex flex-col" style={{ gap: 0 }}>
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
        </div>
      </div>
    </Modal>
  );
}
