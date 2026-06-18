"use client";



/**

 * STEP 0 — Related artifact wiring (AddLinkModal):

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
  IconSquareButton,
  Input,
  Modal,
  TextareaAi,
  Tooltip,
} from "@/components/ui/ds";

import { generateArtifactDescription } from "@/app/actions/generateArtifactDescription";

import {

  applyRelatedSourceVersionUpdate,

  buildRelatedArtifactSelectOptions,

  buildFigmaEmbedUrl,

  DEFAULT_RELATED_ARTIFACT_SELECTION,

  fetchProjectArtifactsForRelatedSelect,

  findRelatedVersionSelectOptions,

  isFigmaUrl,

  isValidHttpUrl,

  parseFigmaFrameNameFromOembedTitle,

  pickLatestRelatedVersionOption,

  relatedArtifactIdToDropdownSelection,

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

  linkUrl: string;

  title: string;

  versionNumber: string;

  description: string;

  relatedSelection: RelatedArtifactSelection;

  relatedSourceVersionUpdate: RelatedSourceVersionUpdate | null;

};



function emptyDraft(defaultTitle: string): DraftState {

  return {

    linkUrl: "",

    title: defaultTitle,

    versionNumber: "v1",

    description: "",

    relatedSelection: DEFAULT_RELATED_ARTIFACT_SELECTION,

    relatedSourceVersionUpdate: null,

  };

}



function draftFromInitial(initial: ArtifactModalInitialValues, defaultTitle: string): DraftState {

  return {

    linkUrl: initial.linkUrl ?? "",

    title: initial.title ?? defaultTitle,

    versionNumber: initial.versionNumber ?? "v1",

    description: initial.description ?? "",

    relatedSelection: relatedArtifactIdToDropdownSelection(initial.relatedArtifactId),

    relatedSourceVersionUpdate: null,

  };

}



export type AddLinkModalProps = {

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



export function AddLinkModal({

  open,

  onClose,

  onSave,

  mode = "add",

  initialValues = null,

  defaultTitle = "Concept 1",

  projectId = null,

  reviewId = null,

}: AddLinkModalProps) {

  const uid = useId();

  const draftRef = useRef<DraftState>(emptyDraft(defaultTitle));

  const [draft, setDraft] = useState<DraftState>(emptyDraft(defaultTitle));

  const [descriptionGenerating, setDescriptionGenerating] = useState(false);

  const [projectArtifacts, setProjectArtifacts] = useState<ProjectArtifactForRelatedSelect[]>([]);

  const titleEditedRef = useRef(false);

  const descriptionEditedRef = useRef(false);



  useEffect(() => {

    if (!open) return;

    titleEditedRef.current = mode === "edit";

    descriptionEditedRef.current = mode === "edit";

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

  const canSave =

    isValidHttpUrl(draft.linkUrl) && draft.title.trim().length > 0 && versionOk;



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



  async function handleSave() {

    if (!canSave) return;

    const localKey = initialValues?.localKey ?? crypto.randomUUID();

    const linkUrl = draft.linkUrl.trim();

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

      kind: "link",

      title: draft.title.trim(),

      versionRowLabel: draft.title.trim() || "Artifact",

      iterationLabel: formatVersionLabel(draft.versionNumber),

      versionNumber: formatVersionLabel(draft.versionNumber),

      description: draft.description.trim(),

      linkUrl,

      file: null,

      fileUrl: null,

      originalFileName: null,

      baseType: linkUrl.toLowerCase().includes("figma.com") ? "Figma" : "Image",

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



  const linkFieldId = `${uid}-link-url`;

  const nameFieldId = `${uid}-link-name`;

  const relatedFieldId = `${uid}-link-related`;

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

              onClick={() => {

                void handleSave();

              }}

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

          {mode === "add" && projectArtifacts.length > 0 ? (

            <RelatedArtifactSelect
              id={relatedFieldId}
              options={relatedArtifactOptions}
              selection={draft.relatedSelection}
              onSelectionChange={handleRelatedArtifactSelectionChange}
            />

          ) : null}

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

        </div>

      </div>

    </Modal>

  );

}


