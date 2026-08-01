"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  logEditReviewSaveEventsAction,
  triggerFigmaSnapshotsForReviewAction,
} from "@/app/reviews/[reviewId]/actions";
import { AddLinkModal } from "@/components/AddLinkModal";
import { ArtifactCountIndicator } from "@/components/artifacts/ArtifactCountIndicator";
import { UploadModal } from "@/components/UploadModal";
import { useToast } from "@/components/Toast";
import type { ArtifactModalInitialValues, ArtifactModalSavePayload } from "@/components/artifact-modals/artifactModalShared";
import {
  ArtifactPreview,
  Button,
  Icon,
  Input,
  Modal,
  Select,
  Textarea,
  Tooltip,
} from "@/components/ui/ds";
import inputStyles from "@/components/ui/ds/Input.module.css";
import modalStyles from "@/components/ui/ds/Modal.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatVersionLabel, isValidVersionString } from "@/lib/artifacts/versioning";
import {
  editReviewStatusOptions,
  isEditReviewStatusSelectDisabled,
  normalizeEditReviewStatus,
} from "@/lib/reviews/editReviewStatusOptions";
import type { ReviewType } from "@/types/review";

type EditReviewArtifact = {
  id: string;
  label: string;
  title: string | null;
  originalFileName: string | null;
  canonicalArtifactId?: string | null;
  type: "Figma" | "PDF" | "Image";
  iteration: string;
  description: string;
  imageUrl: string | null;
  linkUrl: string | null;
};

type EditableArtifact = {
  localKey: string;
  canonicalArtifactId: string | null;
  kind: "file" | "link";
  file: File | null;
  title: string;
  versionRowLabel: string;
  iterationLabel: string;
  versionNumber: string;
  description: string;
  fileUrl: string | null;
  linkUrl: string;
  originalFileName: string | null;
  baseType: "Figma" | "PDF" | "Image";
};

function modalPayloadToEditable(payload: ArtifactModalSavePayload): EditableArtifact {
  return {
    localKey: payload.localKey,
    canonicalArtifactId: payload.canonicalArtifactId,
    kind: payload.kind,
    file: payload.file,
    title: payload.title,
    versionRowLabel: payload.versionRowLabel.trim() || payload.title.trim(),
    iterationLabel: payload.iterationLabel,
    versionNumber: payload.versionNumber,
    description: payload.description,
    fileUrl: payload.fileUrl,
    linkUrl: payload.linkUrl,
    originalFileName: payload.originalFileName,
    baseType: payload.baseType,
  };
}

function editableToModalInitial(artifact: EditableArtifact): ArtifactModalInitialValues {
  return {
    localKey: artifact.localKey,
    canonicalArtifactId: artifact.canonicalArtifactId,
    title: artifact.title,
    linkUrl: artifact.linkUrl,
    versionNumber: artifact.versionNumber,
    description: artifact.description,
    file: artifact.file,
    fileUrl: artifact.fileUrl,
    originalFileName: artifact.originalFileName,
    baseType: artifact.baseType,
  };
}

export type EditReviewDrawerProps = {
  open: boolean;
  onClose: () => void;
  reviewId: string;
  projectId: string;
  initialTitle: string;
  initialStatus: string;
  initialReviewFocus: string;
  initialReviewType: string;
  initialArtifacts: EditReviewArtifact[];
  reviewStage: 1 | 2 | 3 | 4;
  reviewerContributorIds: string[];
  /** Artifact ids that already have reviewer feedback or change requests. */
  artifactIdsWithFeedback?: string[];
  /** Count of reviewer_feedback rows with status = 'submitted'. */
  submittedFeedbackCount?: number;
  onSaved?: () => void;
};

const VERSION_ERROR_COPY = "Use format v1, v2, or v2.1";

const REVIEW_TYPE_OPTIONS: Array<{ value: ReviewType; label: string }> = [
  { value: "align", label: "Align" },
  { value: "compare", label: "Compare" },
  { value: "critique", label: "Critique" },
  { value: "approve", label: "Approve" },
];

const REVIEW_TYPE_HELPER_TEXT: Record<ReviewType, string> = {
  align:
    "Share early direction for high-level input. Reviewers indicate if the work is heading in the right direction.",
  compare:
    "Present multiple options for stakeholders to choose between. The first reviewer selected is the final decision maker.",
  critique:
    "Request detailed feedback on specific aspects of the work. Reviewers summarise their comments from Figma or other tools.",
  approve:
    "Reviewers sign off on individual artifacts or request changes before work progresses.",
};

function normalizeReviewType(value: string): ReviewType {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "alignment" || raw === "align") return "align";
  if (raw === "approval" || raw === "approve") return "approve";
  if (raw === "comparison" || raw === "compare") return "compare";
  if (raw === "critique") return "critique";
  return "approve";
}

function parseVersionNumber(iterationLabel: string) {
  return formatVersionLabel(String(iterationLabel ?? "v1"));
}

function normaliseVersion(raw: string | null | undefined): string {
  if (!raw) return "v1";
  const trimmed = String(raw).trim();
  const iterMatch = trimmed.match(/[Ii]teration\s*(\d+(?:\.\d+)?)/);
  if (iterMatch) return formatVersionLabel(`v${iterMatch[1]}`);
  if (/^v\d+(\.\d+)?$/i.test(trimmed)) return formatVersionLabel(trimmed);
  if (/^\d+(\.\d+)?$/.test(trimmed)) return formatVersionLabel(`v${trimmed}`);
  return "v1";
}

function toEditableArtifact(artifact: EditReviewArtifact): EditableArtifact {
  const iterationLabel = normaliseVersion(artifact.iteration);
  const displayName = artifact.label?.trim() || artifact.title?.trim() || "";
  return {
    localKey: artifact.id,
    canonicalArtifactId: artifact.canonicalArtifactId ?? null,
    kind: artifact.linkUrl ? "link" : "file",
    file: null,
    title: displayName,
    versionRowLabel: displayName || "Artifact",
    iterationLabel,
    versionNumber: parseVersionNumber(iterationLabel),
    description: artifact.description ?? "",
    fileUrl: artifact.imageUrl ?? null,
    linkUrl: artifact.linkUrl ?? "",
    originalFileName: artifact.originalFileName ?? null,
    baseType: artifact.type,
  };
}

function sanitizePathSegment(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200) || "file";
}

function fileTypeForArtifact(artifact: EditableArtifact) {
  if (artifact.kind === "link") {
    return artifact.linkUrl.toLowerCase().includes("figma.com") ? "figma" : "link";
  }
  const fileName = artifact.file?.name ?? artifact.originalFileName ?? "";
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (extension === "pdf" || artifact.baseType === "PDF") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension)) {
    return extension as "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg";
  }
  return artifact.baseType === "Figma" ? "figma" : "generic";
}

function serializeArtifactsForDirtyCheck(artifacts: EditableArtifact[]): string {
  return JSON.stringify(
    artifacts.map((artifact) => ({
      localKey: artifact.localKey,
      title: artifact.title.trim(),
      iterationLabel: artifact.iterationLabel,
      versionNumber: artifact.versionNumber,
      description: artifact.description.trim(),
      kind: artifact.kind,
      linkUrl: artifact.linkUrl.trim(),
      canonicalArtifactId: artifact.canonicalArtifactId,
    })),
  );
}

function topLevelArtifactFileType(artifact: EditableArtifact): "figma" | "pdf" | null {
  if (artifact.kind === "link") {
    return artifact.linkUrl.toLowerCase().includes("figma.com") ? "figma" : null;
  }
  const fileName = artifact.file?.name ?? artifact.originalFileName ?? "";
  return fileName.toLowerCase().endsWith(".pdf") || artifact.baseType === "PDF" ? "pdf" : "figma";
}

const FIXED_DRAWER_SHADOW =
  "-2px 0 4px 0 rgba(41, 33, 28, 0.08), -8px 0 24px 0 rgba(41, 33, 28, 0.18)";

/** Fixed right panel without a full-viewport scrim — main content stays scrollable. */
function FixedSideDrawerPanel({
  open,
  onClose,
  width,
  title,
  subtitle,
  ariaLabel,
  zIndex = 400,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width: number;
  title: string;
  subtitle?: string;
  ariaLabel: string;
  zIndex?: number;
  footer: ReactNode | ((closeDrawer: () => void) => ReactNode);
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width,
        zIndex,
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        boxShadow: FIXED_DRAWER_SHADOW,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 12px 12px 24px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 1.5,
              color: "#6b1e2e",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </p>
          {subtitle ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 400,
                lineHeight: 1.5,
                letterSpacing: "0.26px",
                color: "#998c82",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            padding: 0,
            border: "none",
            borderRadius: 6,
            background: "transparent",
            cursor: "pointer",
            flexShrink: 0,
            color: "#2e1c1c",
          }}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      <div style={{ height: 1, background: "#ede8e0", flexShrink: 0 }} />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "visible",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
      <div style={{ height: 1, background: "#e4ddd3", flexShrink: 0 }} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "16px 24px 20px",
          flexShrink: 0,
          background: "#ffffff",
        }}
      >
        {typeof footer === "function" ? footer(onClose) : footer}
      </div>
    </aside>
  );
}

export function EditReviewDrawer({
  open,
  onClose,
  reviewId,
  projectId,
  initialTitle,
  initialStatus,
  initialReviewFocus,
  initialReviewType,
  initialArtifacts,
  reviewerContributorIds,
  artifactIdsWithFeedback = [],
  submittedFeedbackCount = 0,
  onSaved,
}: EditReviewDrawerProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const initialSnapshotRef = useRef({
    title: initialTitle,
    status: normalizeEditReviewStatus(initialStatus),
    reviewType: normalizeReviewType(initialReviewType),
    focus: initialReviewFocus,
    artifacts: initialArtifacts.map(toEditableArtifact),
  });
  const [title, setTitle] = useState(initialTitle);
  const [reviewStatus, setReviewStatus] = useState(normalizeEditReviewStatus(initialStatus));
  const [focus, setFocus] = useState(initialReviewFocus);
  const [reviewType, setReviewType] = useState<ReviewType>(normalizeReviewType(initialReviewType));
  const [artifacts, setArtifacts] = useState<EditableArtifact[]>(
    initialArtifacts.map(toEditableArtifact),
  );
  const [saving, setSaving] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addLinkModalOpen, setAddLinkModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editingArtifactKey, setEditingArtifactKey] = useState<string | null>(null);
  const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null);
  const [versionErrors, setVersionErrors] = useState<Record<string, string | null>>({});
  const feedbackArtifactIdSet = useMemo(
    () => new Set(artifactIdsWithFeedback.map((id) => id.trim()).filter(Boolean)),
    [artifactIdsWithFeedback],
  );
  const statusOptions = useMemo(() => editReviewStatusOptions(reviewStatus), [reviewStatus]);
  const statusSelectDisabled = isEditReviewStatusSelectDisabled(reviewStatus);
  const canEditSetup = submittedFeedbackCount === 0;
  const reviewTypeLocked = submittedFeedbackCount > 0;
  const drawerOpenInitializedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      drawerOpenInitializedRef.current = false;
      return;
    }
    if (drawerOpenInitializedRef.current) return;
    drawerOpenInitializedRef.current = true;

    const nextArtifacts = initialArtifacts.map(toEditableArtifact);
    initialSnapshotRef.current = {
      title: initialTitle,
      status: normalizeEditReviewStatus(initialStatus),
      reviewType: normalizeReviewType(initialReviewType),
      focus: initialReviewFocus,
      artifacts: nextArtifacts,
    };
    setTitle(initialTitle);
    setReviewStatus(normalizeEditReviewStatus(initialStatus));
    setFocus(initialReviewFocus);
    setReviewType(normalizeReviewType(initialReviewType));
    setArtifacts(nextArtifacts);
    setEditingArtifactKey(null);
    setAddLinkModalOpen(false);
    setUploadModalOpen(false);
    setShowReactivateModal(false);
    setShowCompleteModal(false);
    setError(null);
    setVersionErrors({});
  }, [open, initialTitle, initialStatus, initialReviewFocus, initialReviewType, initialArtifacts]);

  const isDirty = useMemo(() => {
    const snap = initialSnapshotRef.current;
    return (
      title.trim() !== snap.title.trim() ||
      reviewStatus !== snap.status ||
      reviewType !== snap.reviewType ||
      focus.trim() !== snap.focus.trim() ||
      serializeArtifactsForDirtyCheck(artifacts) !== serializeArtifactsForDirtyCheck(snap.artifacts)
    );
  }, [title, reviewStatus, reviewType, focus, artifacts]);

  const compareNeedsMoreArtifacts = reviewType === "compare" && artifacts.length < 2;
  const hasVersionErrors = Object.values(versionErrors).some(Boolean);
  const saveDisabled =
    saving ||
    !isDirty ||
    !title.trim() ||
    (canEditSetup && artifacts.length === 0) ||
    compareNeedsMoreArtifacts ||
    hasVersionErrors;

  const editingArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.localKey === editingArtifactKey) ?? null,
    [artifacts, editingArtifactKey],
  );

  const editingModalInitial = useMemo(
    () => (editingArtifact ? editableToModalInitial(editingArtifact) : null),
    [editingArtifact],
  );

  const pendingRemoveArtifact = useMemo(
    () => artifacts.find((item) => item.localKey === pendingRemoveKey) ?? null,
    [artifacts, pendingRemoveKey],
  );

  function upsertArtifactFromModal(payload: ArtifactModalSavePayload) {
    const artifact = modalPayloadToEditable(payload);
    setArtifacts((prev) => {
      const existingIndex = prev.findIndex((item) => item.localKey === artifact.localKey);
      if (existingIndex === -1) return [...prev, artifact];
      return prev.map((item, index) => (index === existingIndex ? artifact : item));
    });
  }

  async function save(skipReactivateCheck = false, skipCompleteCheck = false) {
    if (saving) return;
    if (!title.trim()) {
      setError("Review title is required.");
      return;
    }
    if (canEditSetup && artifacts.length === 0) {
      setError("Add at least one artifact.");
      return;
    }
    if (reviewType === "compare" && artifacts.length < 2) {
      setError("Compare reviews require at least 2 artifacts.");
      return;
    }

    const artifactsToSave = artifacts.map((artifact) => {
      const trimmed = artifact.versionNumber.trim();
      if (!isValidVersionString(trimmed)) return artifact;
      const label = formatVersionLabel(trimmed);
      return {
        ...artifact,
        versionNumber: label,
        iterationLabel: label,
      };
    });

    for (const artifact of artifactsToSave) {
      if (!isValidVersionString(artifact.versionNumber)) {
        setError("Fix invalid version numbers before saving.");
        return;
      }
    }

    setVersionErrors({});

    if (
      !skipReactivateCheck &&
      initialSnapshotRef.current.status === "paused" &&
      reviewStatus === "in-review"
    ) {
      setShowReactivateModal(true);
      return;
    }

    if (
      !skipCompleteCheck &&
      reviewStatus === "complete" &&
      initialSnapshotRef.current.status !== "complete"
    ) {
      setShowCompleteModal(true);
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    try {
      const storedArtifacts: Array<Record<string, unknown>> = [];
      for (let index = 0; index < artifactsToSave.length; index++) {
        const artifact = artifactsToSave[index];
        if (artifact.kind === "file") {
          let fileUrl = artifact.fileUrl;
          let originalFileName = artifact.originalFileName;
          let mimeType: string | null = null;
          let sizeBytes: number | null = null;

          if (artifact.file) {
            const safeName = sanitizePathSegment(artifact.file.name);
            const objectPath = `${reviewId}/${index}-${crypto.randomUUID()}-${safeName}`;
            const { error: uploadError } = await supabase.storage
              .from("review-artifacts")
              .upload(objectPath, artifact.file, { cacheControl: "3600", upsert: false });
            if (uploadError) {
              setError(uploadError.message);
              return;
            }
            const { data: publicUrl } = supabase.storage
              .from("review-artifacts")
              .getPublicUrl(objectPath);
            fileUrl = publicUrl.publicUrl ?? null;
            originalFileName = artifact.file.name;
            mimeType = artifact.file.type || null;
            sizeBytes = artifact.file.size;
          }

          storedArtifacts.push({
            kind: "file",
            title: artifact.title.trim(),
            iterationLabel: formatVersionLabel(artifact.versionNumber),
            description: artifact.description.trim(),
            url: fileUrl,
            originalFileName,
            mimeType,
            sizeBytes,
          });
        } else {
          storedArtifacts.push({
            kind: "link",
            title: artifact.title.trim(),
            iterationLabel: formatVersionLabel(artifact.versionNumber),
            description: artifact.description.trim(),
            url: artifact.linkUrl.trim(),
          });
        }
      }

      const primaryArtifact = storedArtifacts[0] as Record<string, unknown> | undefined;
      const requireDecisionMaker = reviewType === "compare" || reviewType === "approve";
      const decisionOwnerId =
        requireDecisionMaker && reviewerContributorIds.length > 0 ? reviewerContributorIds[0] : null;

      const removedArtifacts = initialSnapshotRef.current.artifacts
        .filter(
          (initialArtifact) =>
            !artifactsToSave.some((artifact) => artifact.localKey === initialArtifact.localKey),
        )
        .map((artifact) => ({
          id: artifact.localKey,
          title: artifact.title,
          linkUrl: artifact.kind === "link" ? artifact.linkUrl : null,
        }));

      const addedArtifacts = artifactsToSave
        .filter(
          (artifact) =>
            !initialSnapshotRef.current.artifacts.some(
              (initialArtifact) => initialArtifact.localKey === artifact.localKey,
            ),
        )
        .map((artifact) => ({
          title: artifact.title.trim() || "Artifact",
          iterationLabel: formatVersionLabel(artifact.versionNumber),
        }));

      const artifactDescriptionEdits = artifactsToSave.flatMap((artifact) => {
        const initialArtifact = initialSnapshotRef.current.artifacts.find(
          (item) => item.localKey === artifact.localKey,
        );
        if (!initialArtifact) return [];

        const edits: Array<{
          id: string;
          changeType: "title" | "description" | "version";
          artifactTitle: string;
          previousTitle?: string;
          previousVersion?: string;
          newVersion?: string;
        }> = [];

        const previousTitle = initialArtifact.title.trim() || "Artifact";
        const nextTitle = artifact.title.trim() || previousTitle;
        const previousDescription = initialArtifact.description.trim();
        const nextDescription = artifact.description.trim();
        const previousVersion =
          formatVersionLabel(initialArtifact.versionNumber) || "v1";
        const nextVersion = formatVersionLabel(artifact.versionNumber) || "v1";
        const currentTitle = nextTitle || previousTitle || "Artifact";

        if (nextTitle !== previousTitle) {
          edits.push({
            id: artifact.localKey,
            changeType: "title",
            artifactTitle: nextTitle,
            previousTitle,
          });
        }

        if (nextDescription !== previousDescription) {
          edits.push({
            id: artifact.localKey,
            changeType: "description",
            artifactTitle: currentTitle,
          });
        }

        if (nextVersion !== previousVersion) {
          edits.push({
            id: artifact.localKey,
            changeType: "version",
            artifactTitle: currentTitle,
            previousVersion,
            newVersion: nextVersion,
          });
        }

        return edits;
      });

      const { error: reviewUpdateError } = await supabase
        .from("reviews")
        .update({
          title: title.trim(),
          status: reviewStatus,
          review_focus: focus.trim() || null,
          ...(!reviewTypeLocked
            ? {
                review_type: reviewType,
              }
            : {}),
          ...(canEditSetup
            ? {
                require_decision_maker: requireDecisionMaker,
                decision_owner_id: decisionOwnerId,
                artifact_file_name:
                  (primaryArtifact?.originalFileName as string | null | undefined) ??
                  (primaryArtifact?.kind === "link"
                    ? (primaryArtifact?.url as string | null | undefined)
                    : null),
                artifact_file_type:
                  primaryArtifact && artifactsToSave.length > 0
                    ? topLevelArtifactFileType(artifactsToSave[0])
                    : null,
                artifact_name: (primaryArtifact?.title as string | null | undefined) ?? null,
                artifact_iteration:
                  (primaryArtifact?.iterationLabel as string | null | undefined) ?? null,
                artifact_description:
                  (primaryArtifact?.description as string | null | undefined) ?? null,
                artifact_file_url: (primaryArtifact?.url as string | null | undefined) ?? null,
                artifacts: storedArtifacts,
              }
            : {}),
        })
        .eq("id", reviewId);

      if (reviewUpdateError) {
        setError(reviewUpdateError.message);
        return;
      }

      void triggerFigmaSnapshotsForReviewAction(reviewId, reviewStatus);

      if (canEditSetup) {
        const { data: currentVersionRows, error: versionQueryError } = await supabase
          .from("artifact_versions")
          .select("artifact_id")
          .eq("review_id", reviewId);
        if (versionQueryError) {
          setError(versionQueryError.message);
          return;
        }

        const existingArtifactIds = new Set(
          (currentVersionRows ?? [])
            .map((row) => String((row as Record<string, unknown>).artifact_id ?? "").trim())
            .filter(Boolean),
        );

        const { error: deleteVersionsError } = await supabase
          .from("artifact_versions")
          .delete()
          .eq("review_id", reviewId);
        if (deleteVersionsError) {
          setError(deleteVersionsError.message);
          return;
        }

        for (let index = 0; index < artifactsToSave.length; index++) {
          const artifact = artifactsToSave[index];
          const storedArtifact = storedArtifacts[index] as Record<string, unknown>;
          let canonicalArtifactId = artifact.canonicalArtifactId;

          if (canonicalArtifactId) {
            // Existing artifact row — version fields live on artifact_versions only.
          } else {
            const { data: insertedArtifact, error: artifactInsertError } = await supabase
              .from("artifacts")
              .insert({
                project_id: projectId,
                name: artifact.title.trim(),
                description: artifact.description.trim() || null,
              })
              .select("id")
              .single();
            if (artifactInsertError || !insertedArtifact) {
              setError(artifactInsertError?.message ?? "Could not create artifact.");
              return;
            }
            canonicalArtifactId = String(
              (insertedArtifact as Record<string, unknown>).id ?? "",
            ).trim();
          }

          const { error: insertVersionError } = await supabase.from("artifact_versions").insert({
            artifact_id: canonicalArtifactId,
            version_number: formatVersionLabel(artifact.versionNumber),
            review_id: reviewId,
            label: artifact.versionRowLabel.trim() || artifact.title.trim() || "Artifact",
            file_url: artifact.kind === "file" ? (storedArtifact.url as string | null) : null,
            link_url: artifact.kind === "link" ? artifact.linkUrl.trim() : null,
            file_name:
              artifact.kind === "file"
                ? ((storedArtifact.originalFileName as string | null | undefined) ?? null)
                : null,
            file_type: fileTypeForArtifact(artifact),
            description: artifact.description.trim() || null,
          });
          if (insertVersionError) {
            setError(insertVersionError.message);
            return;
          }
        }

        const remainingArtifactIds = new Set(
          artifactsToSave
            .map((artifact) => artifact.canonicalArtifactId ?? "")
            .map((value) => value.trim())
            .filter(Boolean),
        );

        for (const artifactId of existingArtifactIds) {
          if (remainingArtifactIds.has(artifactId)) continue;
          const { count } = await supabase
            .from("artifact_versions")
            .select("id", { count: "exact", head: true })
            .eq("artifact_id", artifactId);
          if ((count ?? 0) === 0) {
            const { error: deleteArtifactError } = await supabase
              .from("artifacts")
              .delete()
              .eq("id", artifactId);
            if (deleteArtifactError) {
              setError(deleteArtifactError.message);
              return;
            }
          }
        }
      }

      if (!canEditSetup) {
        for (const artifact of artifactsToSave) {
          const initialArtifact = initialSnapshotRef.current.artifacts.find(
            (item) => item.localKey === artifact.localKey,
          );
          if (!initialArtifact?.canonicalArtifactId) continue;

          const previousVersion = formatVersionLabel(initialArtifact.versionNumber);
          const nextVersion = formatVersionLabel(artifact.versionNumber);
          if (previousVersion === nextVersion) continue;

          const { error: versionUpdateError } = await supabase
            .from("artifact_versions")
            .update({ version_number: nextVersion })
            .eq("review_id", reviewId)
            .eq("artifact_id", initialArtifact.canonicalArtifactId);
          if (versionUpdateError) {
            setError(versionUpdateError.message);
            return;
          }
        }
      }

      const timelineResult = await logEditReviewSaveEventsAction({
        reviewId,
        projectId,
        reviewTitle: title.trim(),
        reviewType,
        previousTitle: initialSnapshotRef.current.title,
        newTitle: title.trim(),
        previousFocus: initialSnapshotRef.current.focus,
        newFocus: focus.trim(),
        previousReviewType: initialSnapshotRef.current.reviewType,
        newReviewType: reviewType,
        reviewTypeLocked,
        previousStatus: initialSnapshotRef.current.status,
        newStatus: reviewStatus,
        removedArtifacts,
        addedArtifacts,
        artifactDescriptionEdits,
      });
      if (!timelineResult.success) {
        console.error(
          "[EditReviewDrawer] activity log failed:",
          timelineResult.error,
        );
        showToast("Changes saved, but activity log could not be updated.");
      }

      /*
       * STEP 0 — Save close + tab navigation:
       * - Success path calls onClose() after Supabase update (never router.push on save).
       * - Activity tab navigation was triggered by router.push on reactivation — removed;
       *   optional "View" on the reactivation toast only.
       * - Parent onSaved may router.refresh(); must not change the active tab.
       */
      const isReactivation =
        initialSnapshotRef.current.status === "paused" && reviewStatus === "in-review";
      const isCompleteSave =
        reviewStatus === "complete" && initialSnapshotRef.current.status !== "complete";

      if (isReactivation) {
        showToast("Review reactivated");
        showToast({
          message: "Reviewers notified",
          actionLabel: "View activity",
          onAction: () => {
            router.push(`/reviews/${reviewId}?tab=activity`);
          },
        });
      } else if (isCompleteSave) {
        showToast("Review marked as complete");
      } else if (timelineResult.success) {
        showToast("Changes saved");
      }

      initialSnapshotRef.current = {
        title: title.trim(),
        status: reviewStatus,
        reviewType,
        focus: focus.trim(),
        artifacts: artifactsToSave,
      };

      setArtifacts(artifactsToSave);
      setSaving(false);
      onClose();
      onSaved?.();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save review.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <FixedSideDrawerPanel
        open={open}
        onClose={onClose}
        width={600}
        zIndex={400}
        title="Edit review"
        ariaLabel="Edit review"
        footer={(closeDrawer) => (
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              label="Cancel"
              size="sm"
              onClick={closeDrawer}
            />
            {compareNeedsMoreArtifacts ? (
              <Tooltip label="Compare reviews require at least 2 artifacts" position="top">
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="primary"
                    label={saving ? "Saving…" : "Save"}
                    size="sm"
                    disabled
                    onClick={() => undefined}
                  />
                </span>
              </Tooltip>
            ) : (
              <Button
                type="button"
                variant="primary"
                label={saving ? "Saving…" : "Save"}
                size="sm"
                disabled={saveDisabled}
                onClick={() => {
                  void save(false, false);
                }}
              />
            )}
          </div>
        )}
      >
        <div className="flex flex-col gap-5">
          {error ? (
            <p className="text-[13px] font-medium" style={{ color: "#8b2020" }}>
              {error}
            </p>
          ) : null}
          <Input
            type="text"
            label="Review title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            size="sm"
          />
          <Select
            label="Review status"
            required
            size="sm"
            portaled
            disabled={statusSelectDisabled}
            options={statusOptions}
            value={reviewStatus}
            onChange={(value) => setReviewStatus(normalizeEditReviewStatus(value))}
          />
          <div className="flex flex-col gap-[6px]">
            <Select
              label="Review type"
              required
              size="sm"
              portaled
              disabled={reviewTypeLocked}
              options={REVIEW_TYPE_OPTIONS}
              value={reviewType}
              onChange={(value) => setReviewType(normalizeReviewType(value))}
            />
            {reviewTypeLocked ? (
              <p className="m-0 text-[12px] text-[#6b5e55]">
                Review type can&apos;t be changed once feedback has been submitted.
              </p>
            ) : (
              <p className="m-0 text-[12px] text-[#6b5e55]">{REVIEW_TYPE_HELPER_TEXT[reviewType]}</p>
            )}
          </div>
          <Textarea
            label="Review focus"
            required
            showLabel
            placeholder="What initial focus or questions do you have for the reviewers?"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            variant="form-fixed"
            size="sm"
          />
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[13px] font-medium text-[#2e1c1c]">
              Artifacts
              <span className={inputStyles.required} aria-hidden="true">
                *
              </span>
            </p>
            {canEditSetup ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  label="Add Link"
                  icon="leading"
                  iconName="link"
                  onClick={() => {
                    setEditingArtifactKey(null);
                    setAddLinkModalOpen(true);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  label="Upload"
                  icon="leading"
                  iconName="upload"
                  onClick={() => {
                    setEditingArtifactKey(null);
                    setUploadModalOpen(true);
                  }}
                />
                <ArtifactCountIndicator count={artifacts.length} />
              </div>
            ) : (
              <p className="m-0 text-[12px] text-[#6b5e55]">
                Artifacts can&apos;t be changed once feedback has been submitted.
              </p>
            )}
            {artifacts.map((artifact, index) => {
                const canDelete = !feedbackArtifactIdSet.has(artifact.localKey);
                const versionError = versionErrors[artifact.localKey] ?? null;
                return (
                  <ArtifactPreview
                    key={artifact.localKey}
                    size="large"
                    compact
                    fileType={fileTypeForArtifact(artifact)}
                    mode={canEditSetup ? "editable" : "readonly"}
                    showDetails
                    enableOpenInteraction={!canEditSetup}
                    fileName={
                      artifact.kind === "file"
                        ? artifact.originalFileName ?? artifact.title ?? "Untitled"
                        : artifact.title || artifact.linkUrl || "Untitled"
                    }
                    lastEdited="Edited recently"
                    artifactName={artifact.title}
                    iteration={artifact.versionNumber}
                    description={artifact.description}
                    iterationFreeText={canEditSetup}
                    iterationPlaceholder="e.g. v2.1"
                    iterationError={Boolean(versionError)}
                    iterationErrorMessage={versionError ?? undefined}
                    imageUrl={artifact.fileUrl ?? undefined}
                    linkUrl={artifact.kind === "link" ? artifact.linkUrl : undefined}
                    showOptimiseButton={false}
                    onArtifactNameChange={(name) =>
                      setArtifacts((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                title: name,
                                versionRowLabel: name.trim() || item.versionRowLabel,
                              }
                            : item,
                        ),
                      )
                    }
                    onIterationChange={(value) => {
                      setVersionErrors((prev) => ({
                        ...prev,
                        [artifact.localKey]: null,
                      }));
                      setArtifacts((prev) =>
                        prev.map((item, itemIndex) => {
                          if (itemIndex !== index) return item;
                          return {
                            ...item,
                            versionNumber: value,
                            iterationLabel: value,
                          };
                        }),
                      );
                    }}
                    onIterationBlur={(value) => {
                      const trimmed = value.trim();
                      if (!isValidVersionString(trimmed)) {
                        setVersionErrors((prev) => ({
                          ...prev,
                          [artifact.localKey]: VERSION_ERROR_COPY,
                        }));
                        return;
                      }
                      const label = formatVersionLabel(trimmed);
                      setVersionErrors((prev) => ({
                        ...prev,
                        [artifact.localKey]: null,
                      }));
                      setArtifacts((prev) =>
                        prev.map((item, itemIndex) => {
                          if (itemIndex !== index) return item;
                          return {
                            ...item,
                            versionNumber: label,
                            iterationLabel: label,
                          };
                        }),
                      );
                    }}
                    onDescriptionChange={(description) =>
                      setArtifacts((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, description } : item,
                        ),
                      )
                    }
                    onMinimise={
                      canEditSetup
                        ? () => {
                            if (canDelete) setPendingRemoveKey(artifact.localKey);
                          }
                        : undefined
                    }
                    removeDisabled={canEditSetup && !canDelete}
                    removeDisabledTooltip="Cannot remove — feedback has been received on this artifact."
                  />
                );
              })}
            {artifacts.length === 0 ? (
              <p className="m-0 text-[12px] text-[#998c82]">No artifacts added yet.</p>
            ) : null}
          </div>
        </div>
      </FixedSideDrawerPanel>
      <AddLinkModal
        open={addLinkModalOpen}
        mode={editingArtifactKey ? "edit" : "add"}
        projectId={projectId}
        reviewId={reviewId}
        initialValues={editingArtifactKey ? editingModalInitial : null}
        defaultTitle={`Concept ${artifacts.length + 1}`}
        onClose={() => {
          setAddLinkModalOpen(false);
          setEditingArtifactKey(null);
        }}
        onSave={(payload) => {
          upsertArtifactFromModal(payload);
          setAddLinkModalOpen(false);
          setEditingArtifactKey(null);
        }}
      />
      <UploadModal
        open={uploadModalOpen}
        mode={editingArtifactKey ? "edit" : "add"}
        projectId={projectId}
        reviewId={reviewId}
        initialValues={editingArtifactKey ? editingModalInitial : null}
        defaultTitle={`Concept ${artifacts.length + 1}`}
        onClose={() => {
          setUploadModalOpen(false);
          setEditingArtifactKey(null);
        }}
        onSave={(payload) => {
          upsertArtifactFromModal(payload);
          setUploadModalOpen(false);
          setEditingArtifactKey(null);
        }}
      />
      {showReactivateModal && typeof document !== "undefined"
        ? createPortal(
            <Modal
              open={showReactivateModal}
              type="default"
              size="sm"
              title="Reactivate review?"
              description="Reactivating this review will notify all reviewers that it's active again. Are you sure you want to continue?"
              confirmLabel="Reactivate & Notify"
              onClose={() => setShowReactivateModal(false)}
              onConfirm={() => {
                setShowReactivateModal(false);
                void save(true);
              }}
            />,
            document.body,
          )
        : null}
      {showCompleteModal && typeof document !== "undefined"
        ? createPortal(
            <Modal
              open={showCompleteModal}
              type="default"
              size="sm"
              title="Mark as complete?"
              description="This will close the review. You can reopen it later from the review page."
              confirmLabel="Mark as complete"
              onClose={() => setShowCompleteModal(false)}
              onConfirm={() => {
                setShowCompleteModal(false);
                void save(false, true);
              }}
            />,
            document.body,
          )
        : null}
      {pendingRemoveKey && typeof document !== "undefined"
        ? createPortal(
            <Modal
              open
              type="default"
              size="sm"
              title="Delete Artifact"
              showSubtitle={false}
              className={modalStyles.deleteArtifactDialog}
              onClose={() => setPendingRemoveKey(null)}
              footer={
                <>
                  <div className={modalStyles.spacer} />
                  <button
                    type="button"
                    className={modalStyles.btnSecondary}
                    onClick={() => setPendingRemoveKey(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={modalStyles.btnDestructive}
                    onClick={() => {
                      setArtifacts((prev) =>
                        prev.filter((item) => item.localKey !== pendingRemoveKey),
                      );
                      setPendingRemoveKey(null);
                    }}
                  >
                    Delete
                  </button>
                </>
              }
            >
              <p className="m-0 text-[13px] text-[#6b5e55]">
                Are you sure you want to delete &ldquo;
                {pendingRemoveArtifact?.title?.trim() || "this artifact"}
                &rdquo; from this review? This can&apos;t be undone and will appear on the activity
                log.
              </p>
            </Modal>,
            document.body,
          )
        : null}
    </>
  );
}
