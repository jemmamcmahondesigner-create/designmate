"use client";



/**

 * STEP 0 — Related artifact wiring (UploadModal):

 * - Dropdown query: `fetchProjectArtifactsForRelatedSelect` in

 *   `artifactModalShared.ts` → Supabase

 *   `.from("artifacts").select("..., artifact_versions!inner(...)").eq("project_id", projectId)`

 * - onSelect: `handleRelatedArtifactChange` → `resolveRelatedArtifactSelection(artifact, reviewId)` +
 *   local draft state (`versionNumber`, `title`, `relatedSourceVersionUpdate`)

 */



import { useEffect, useId, useRef, useState } from "react";

import { RelatedArtifactSelect } from "@/components/artifact-modals/RelatedArtifactSelect";
import {
  Button,
  Icon,
  Input,
  Modal,
  TextareaAi,
  Tooltip,
} from "@/components/ui/ds";

import { generateArtifactDescription } from "@/app/actions/generateArtifactDescription";

import {

  ACCEPTED_MIME_TYPES,

  applyRelatedSourceVersionUpdate,

  buildRelatedArtifactSelectOptions,

  DEFAULT_RELATED_ARTIFACT_SELECTION,

  fetchProjectArtifactsForRelatedSelect,

  findRelatedVersionSelectOptions,

  formatFileSize,

  pickLatestRelatedVersionOption,

  relatedArtifactIdToDropdownSelection,

  resolveBaseTypeFromFile,

  resolveRelatedArtifactSelection,

  type ArtifactModalInitialValues,

  type ArtifactModalSavePayload,

  type ProjectArtifactForRelatedSelect,

  type RelatedArtifactSelection,

  type RelatedSourceVersionUpdate,

} from "@/components/artifact-modals/artifactModalShared";

import { formatVersionLabel, isValidVersionString } from "@/lib/artifacts/versioning";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";



type DraftState = {

  title: string;

  versionNumber: string;

  description: string;

  file: File | null;

  relatedSelection: RelatedArtifactSelection;

  relatedSourceVersionUpdate: RelatedSourceVersionUpdate | null;

};



function emptyDraft(defaultTitle: string): DraftState {

  return {

    title: defaultTitle,

    versionNumber: "v1",

    description: "",

    file: null,

    relatedSelection: DEFAULT_RELATED_ARTIFACT_SELECTION,

    relatedSourceVersionUpdate: null,

  };

}



function draftFromInitial(initial: ArtifactModalInitialValues, defaultTitle: string): DraftState {

  return {

    title: initial.title ?? defaultTitle,

    versionNumber: initial.versionNumber ?? "v1",

    description: initial.description ?? "",

    file: initial.file ?? null,

    relatedSelection: relatedArtifactIdToDropdownSelection(initial.relatedArtifactId),

    relatedSourceVersionUpdate: null,

  };

}



export type UploadModalProps = {

  open: boolean;

  onClose: () => void;

  onSave: (payload: ArtifactModalSavePayload) => void;

  mode?: "add" | "edit";

  initialValues?: ArtifactModalInitialValues | null;

  defaultTitle?: string;

  projectId?: string | null;

  /** Current review context — null during create flow (cross-review major increment only). */
  reviewId?: string | null;

};



export function UploadModal({

  open,

  onClose,

  onSave,

  mode = "add",

  initialValues = null,

  defaultTitle = "Concept 1",

  projectId = null,

  reviewId = null,

}: UploadModalProps) {

  const uid = useId();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const draftRef = useRef<DraftState>(emptyDraft(defaultTitle));

  const existingFileNameRef = useRef<string | null>(null);

  const existingFileUrlRef = useRef<string | null>(null);

  const titleEditedRef = useRef(false);

  const descriptionEditedRef = useRef(false);

  const [draft, setDraft] = useState<DraftState>(emptyDraft(defaultTitle));

  const [descriptionGenerating, setDescriptionGenerating] = useState(false);

  const [projectArtifacts, setProjectArtifacts] = useState<ProjectArtifactForRelatedSelect[]>([]);



  useEffect(() => {

    if (!open) return;

    titleEditedRef.current = mode === "edit";

    descriptionEditedRef.current = mode === "edit";

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



  useEffect(() => {

    if (!open || !projectId?.trim() || mode === "edit") {

      setProjectArtifacts([]);

      return;

    }

    let cancelled = false;

    const supabase = createSupabaseBrowserClient();

    void fetchProjectArtifactsForRelatedSelect(supabase, projectId.trim()).then((rows) => {

      if (!cancelled) setProjectArtifacts(rows);

    });

    return () => {

      cancelled = true;

    };

  }, [open, projectId, mode]);



  const relatedArtifactOptions = buildRelatedArtifactSelectOptions(projectArtifacts);

  const versionOk = isValidVersionString(draft.versionNumber);

  const hasFile = Boolean(draft.file || existingFileNameRef.current);

  const canSave = hasFile && draft.title.trim().length > 0 && versionOk;



  function handleRelatedArtifactSelectionChange(selection: RelatedArtifactSelection) {

    if (selection.type === "new") {

      setDraft((prev) => ({

        ...prev,

        relatedSelection: selection,

        versionNumber: "v1",

        relatedSourceVersionUpdate: null,

        title: titleEditedRef.current ? prev.title : defaultTitle,

      }));

      return;

    }



    const matches = findRelatedVersionSelectOptions(

      relatedArtifactOptions,

      selection.versionIds,

    );

    if (matches.length === 0) {

      setDraft((prev) => ({

        ...prev,

        relatedSelection: DEFAULT_RELATED_ARTIFACT_SELECTION,

        versionNumber: "v1",

        relatedSourceVersionUpdate: null,

      }));

      return;

    }



    const resolved = resolveRelatedArtifactSelection(matches, reviewId);

    setDraft((prev) => ({

      ...prev,

      relatedSelection: selection,

      title: titleEditedRef.current ? prev.title : resolved.title,

      versionNumber: resolved.versionNumber,

      description: descriptionEditedRef.current ? prev.description : resolved.description,

      relatedSourceVersionUpdate: resolved.relatedSourceVersionUpdate,

    }));

  }



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



  async function handleSave() {

    if (!canSave) return;

    const localKey = initialValues?.localKey ?? crypto.randomUUID();

    const file = draft.file;

    const originalFileName = file?.name ?? existingFileNameRef.current;

    const relatedVersion =
      draft.relatedSelection.type === "versions" &&
      draft.relatedSelection.versionIds.length > 0
        ? pickLatestRelatedVersionOption(
            findRelatedVersionSelectOptions(
              relatedArtifactOptions,
              draft.relatedSelection.versionIds,
            ),
          )
        : null;

    const canonicalArtifactId =
      mode === "edit" && initialValues?.canonicalArtifactId
        ? initialValues.canonicalArtifactId
        : relatedVersion?.artifactId ?? initialValues?.canonicalArtifactId ?? null;



    const payload: ArtifactModalSavePayload = {

      localKey,

      canonicalArtifactId,

      kind: "file",

      title: draft.title.trim(),

      versionRowLabel: draft.title.trim() || "Artifact",

      iterationLabel: formatVersionLabel(draft.versionNumber),

      versionNumber: formatVersionLabel(draft.versionNumber),

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

      relatedSourceVersionUpdate: draft.relatedSourceVersionUpdate,

    };



    onSave(payload);



    const supabase = createSupabaseBrowserClient();

    await applyRelatedSourceVersionUpdate(
      supabase,
      draft.relatedSourceVersionUpdate,
      reviewId,
    );

  }



  const nameFieldId = `${uid}-upload-name`;

  const relatedFieldId = `${uid}-upload-related`;

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

                onClick={() => {

                  void handleSave();

                }}

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



        {mode === "add" && projectArtifacts.length > 0 ? (

          <div style={{ marginTop: 12 }}>

            <RelatedArtifactSelect
              id={relatedFieldId}
              options={relatedArtifactOptions}
              selection={draft.relatedSelection}
              onSelectionChange={handleRelatedArtifactSelectionChange}
            />

          </div>

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

              onChange={(event) => {

                titleEditedRef.current = true;

                setDraft((prev) => ({ ...prev, title: event.target.value }));

              }}

            />

          </div>

          <div style={{ width: 120, flexShrink: 0 }}>

            <Input

              label="Version"

              size="sm"

              compact

              placeholder="v1"

              value={draft.versionNumber}

              onChange={(event) =>

                setDraft((prev) => ({

                  ...prev,

                  versionNumber: event.target.value,

                }))

              }

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

            onChange={(event) => {

              descriptionEditedRef.current = true;

              setDraft((prev) => ({ ...prev, description: event.target.value }));

            }}

            showLoadingButton={false}

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

              label={descriptionGenerating ? "Optimising…" : "Optimise with Ai"}

              icon="leading"

              iconName={descriptionGenerating ? "loading" : "ai-stars"}

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


