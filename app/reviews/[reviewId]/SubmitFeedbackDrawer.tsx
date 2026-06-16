"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Divider,
  Icon,
  Menu,
  Select,
  SelectField,
  StatusPill,
  Tag,
  Textarea,
  Tooltip,
} from "@/components/ui/ds";
import { submitReviewerFeedbackAction } from "./actions";
import { ChangeRequestModal } from "./ChangeRequestModal";

type DrawerReviewArtifact = {
  id: string;
  title?: string | null;
  label: string;
  iteration: string;
};

type DrawerReview = {
  id: string;
  reviewType: string;
  reviewFocus: string;
  artifacts: DrawerReviewArtifact[];
};

type DrawerAssignedReviewer = {
  id: string;
  name: string;
  hasSubmitted?: boolean;
};

type SubmitFeedbackDrawerProps = {
  review: DrawerReview;
  /** When the review lifecycle is `complete` — no further submissions. */
  reviewClosed?: boolean;
  /** Pre-fill when the reviewer already has a submitted `reviewer_feedback` row. */
  existingFeedbackDraft?: {
    feedbackText: string;
    selectedOption: string | null;
  } | null;
  /** Resubmit / prefill flow — footer shows "Re-submit" (Align) or "Update feedback". */
  resubmitMode?: boolean;
  /** Existing `reviewer_feedback` row id when amending submitted Align feedback. */
  existingFeedbackId?: string | null;
  /** Approve resubmit: empty change-request UI; do not carry prior approvals. */
  clearChangeRequests?: boolean;
  /** Align edit: pre-populate saved change request rows from the server. */
  initialChangeRequests?: SavedChangeRequest[];
  /** Defer parent refresh until the drawer closes after a change request is saved. */
  deferRevalidate?: boolean;
  onChangeRequestCreated?: () => void;
  currentContributorId: string | null;
  isReviewCreator?: boolean;
  defaultOnBehalfOf?: string | null;
  assignedReviewers?: DrawerAssignedReviewer[];
  onClose: () => void;
  onSubmitSuccess: () => void;
};

type SavedChangeRequest = {
  batchId: string;
  artifactIds: string[];
  changesNeeded: string;
};

const CRITIQUE_WHERE_OPTIONS = [
  { value: "figma", label: "Figma" },
  { value: "email", label: "Email" },
  { value: "slack", label: "Slack" },
  { value: "in-person", label: "In person" },
  { value: "in-meeting", label: "In meeting" },
  { value: "other", label: "Other" },
];

function artifactTitleStoreKey(artifact: DrawerReviewArtifact) {
  const title = artifact.title?.trim() ?? "";
  return title !== "" ? title : artifact.id;
}

function displayVersion(label: string | null | undefined) {
  return label?.replace(/^Iteration\s+(\d+)$/i, "v$1") ?? label ?? "";
}

function artifactLabelsForKeys(
  keys: string[],
  artifacts: DrawerReviewArtifact[],
): string[] {
  return keys.map((key) => {
    const match = artifacts.find(
      (artifact) => artifactTitleStoreKey(artifact) === key,
    );
    return match?.label ?? key;
  });
}

function toReviewTypeLabel(reviewType: string) {
  const normalized = reviewType.trim().toLowerCase();
  if (normalized === "compare") return "Compare";
  if (normalized === "approve") return "Approve";
  if (normalized === "critique") return "Critique";
  if (normalized === "align") return "Align";
  return "Review";
}

export function SubmitFeedbackDrawer({
  review,
  reviewClosed = false,
  existingFeedbackDraft = null,
  resubmitMode = false,
  existingFeedbackId = null,
  clearChangeRequests = false,
  initialChangeRequests = [],
  deferRevalidate = false,
  onChangeRequestCreated,
  currentContributorId,
  isReviewCreator = false,
  defaultOnBehalfOf = null,
  assignedReviewers = [],
  onClose,
  onSubmitSuccess,
}: SubmitFeedbackDrawerProps) {
  const [focusExpanded, setFocusExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [feedbackSubmitAttempted, setFeedbackSubmitAttempted] = useState(false);
  const [changeRequestCount, setChangeRequestCount] = useState(0);
  const [savedChangeRequests, setSavedChangeRequests] = useState<SavedChangeRequest[]>([]);
  const [showChangeRequestModal, setShowChangeRequestModal] = useState(false);
  const [showFocusAccordion, setShowFocusAccordion] = useState(false);
  const focusMeasureRef = useRef<HTMLParagraphElement | null>(null);
  const approveSelectAnchorRef = useRef<HTMLDivElement | null>(null);
  const [approveArtifactsMenuOpen, setApproveArtifactsMenuOpen] = useState(false);
  const [selectedReviewerId, setSelectedReviewerId] = useState<string>("");

  const [selectedComparisonArtifactIds, setSelectedComparisonArtifactIds] =
    useState<string[]>([]);
  const [comparisonFeedbackText, setComparisonFeedbackText] = useState("");

  const [selectedApproveArtifactIds, setSelectedApproveArtifactIds] = useState<string[]>(
    []
  );
  const [approveComments, setApproveComments] = useState("");
  const [approveRequestedChange, setApproveRequestedChange] = useState(false);

  const [alignmentFeedbackText, setAlignmentFeedbackText] = useState("");
  const [alignRequestedChange, setAlignRequestedChange] = useState(false);

  const [critiqueWhere, setCritiqueWhere] = useState("");
  const [critiqueGeneralComment, setCritiqueGeneralComment] = useState("");

  const reviewType = review.reviewType.trim().toLowerCase();
  const isCompare = reviewType === "compare";
  const isApprove = reviewType === "approve";
  const isAlign = reviewType === "align";
  const isCritique = reviewType === "critique";

  const isEditing = Boolean(existingFeedbackDraft);
  const footerPrimaryLabel =
    resubmitMode && isAlign
      ? "Re-submit"
      : resubmitMode
        ? "Update feedback"
        : "Submit feedback";
  const headerTitle = isApprove ? "Submit Feedback" : isEditing ? "Edit your feedback" : "Submit Feedback";
  const dialogLabel = isApprove ? "Submit Feedback" : isEditing ? "Edit your feedback" : "Submit Feedback";
  const focusText = review.reviewFocus || "No review focus provided.";
  const displayFocusText = focusExpanded ? focusText : focusText;

  const dedupedAssignedReviewers = useMemo(
    () =>
      Array.from(
        new Map(
          assignedReviewers.map((reviewer) => [reviewer.id, reviewer] as const),
        ).values(),
      ),
    [assignedReviewers],
  );
  const isAssignedReviewer = dedupedAssignedReviewers.some(
    (reviewer) => reviewer.id === String(currentContributorId ?? "").trim(),
  );
  const effectiveReviewerId = isReviewCreator && !isAssignedReviewer
    ? selectedReviewerId.trim()
    : String(currentContributorId ?? "").trim();
  const shouldShowOnBehalfSelect = isReviewCreator && !isAssignedReviewer;

  useEffect(() => {
    if (!clearChangeRequests) return;
    setSavedChangeRequests([]);
    setChangeRequestCount(0);
    setSelectedApproveArtifactIds([]);
  }, [clearChangeRequests]);

  useEffect(() => {
    if (!resubmitMode || !isAlign || initialChangeRequests.length === 0) return;
    setSavedChangeRequests(initialChangeRequests);
    setChangeRequestCount(initialChangeRequests.length);
  }, [resubmitMode, isAlign, initialChangeRequests, review.id]);

  useEffect(() => {
    if (!isReviewCreator) {
      setSelectedReviewerId("");
      return;
    }
    const preferredReviewerId = String(defaultOnBehalfOf ?? "").trim();
    if (
      preferredReviewerId &&
      dedupedAssignedReviewers.some((reviewer) => reviewer.id === preferredReviewerId)
    ) {
      setSelectedReviewerId(preferredReviewerId);
      return;
    }
    setSelectedReviewerId("");
  }, [isReviewCreator, defaultOnBehalfOf, dedupedAssignedReviewers]);

  useEffect(() => {
    function updateFocusOverflow() {
      const node = focusMeasureRef.current;
      if (!node) return;
      setShowFocusAccordion(node.scrollHeight > 80);
    }
    updateFocusOverflow();
    window.addEventListener("resize", updateFocusOverflow);
    return () => window.removeEventListener("resize", updateFocusOverflow);
  }, [focusText]);

  useEffect(() => {
    if (!existingFeedbackDraft) return;
    const text = existingFeedbackDraft.feedbackText ?? "";
    const opt = String(existingFeedbackDraft.selectedOption ?? "").trim();
    if (isCompare) {
      const keys = opt
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (keys.length > 0) setSelectedComparisonArtifactIds(keys);
      setComparisonFeedbackText(text);
    } else if (isApprove) {
      const keys = opt
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (keys.length > 0) setSelectedApproveArtifactIds(keys);
      setApproveComments(text);
    } else if (isAlign) {
      setAlignmentFeedbackText(text);
    } else if (isCritique) {
      const known = CRITIQUE_WHERE_OPTIONS.some((o) => o.value === opt);
      if (known) setCritiqueWhere(opt);
      setCritiqueGeneralComment(text);
    }
  }, [existingFeedbackDraft, isCompare, isApprove, isAlign, isCritique, review.id]);

  const changeRequestArtifactKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of savedChangeRequests) {
      for (const id of entry.artifactIds) {
        keys.add(id);
      }
    }
    return keys;
  }, [savedChangeRequests]);

  const approveArtifactMenuOptions = review.artifacts.filter((artifact) => {
    const key = artifactTitleStoreKey(artifact);
    return !changeRequestArtifactKeys.has(key);
  });
  const allArtifactsHaveChangeRequests =
    review.artifacts.length > 0 && approveArtifactMenuOptions.length === 0;

  const selectedApproveArtifactLabel = useMemo(() => {
    const labels = review.artifacts
      .filter((artifact) =>
        selectedApproveArtifactIds.includes(artifactTitleStoreKey(artifact)),
      )
      .map((artifact) => artifact.label);
    return labels.join(", ");
  }, [review.artifacts, selectedApproveArtifactIds]);

  const allArtifactsApproved = useMemo(() => {
    if (review.artifacts.length === 0) return false;
    return review.artifacts.every((artifact) =>
      selectedApproveArtifactIds.includes(artifactTitleStoreKey(artifact)),
    );
  }, [review.artifacts, selectedApproveArtifactIds]);

  const changeRequestArtifacts = useMemo(
    () =>
      review.artifacts.filter(
        (artifact) =>
          !selectedApproveArtifactIds.includes(artifactTitleStoreKey(artifact)),
      ),
    [review.artifacts, selectedApproveArtifactIds],
  );
  const mappedSavedChanges = savedChangeRequests.map((entry, index) => ({
    id: `saved-change-${index}`,
    description:
      entry.changesNeeded.trim() || entry.artifactIds.join(", ") || "Change request",
    artifactLabels: artifactLabelsForKeys(entry.artifactIds, review.artifacts),
  }));
  const hasLoggedChangeRequests =
    changeRequestCount > 0 || savedChangeRequests.length > 0;

  const submitEnabled = useMemo(() => {
    if (isCompare) {
      return (
        selectedComparisonArtifactIds.length > 0 &&
        comparisonFeedbackText.trim().length > 0
      );
    }
    if (isApprove) {
      return selectedApproveArtifactIds.length > 0 || hasLoggedChangeRequests;
    }
    if (isAlign) {
      return alignmentFeedbackText.trim().length > 0 || changeRequestCount > 0;
    }
    if (isCritique) {
      if (!critiqueWhere) return false;
      return true;
    }
    return false;
  }, [
    alignmentFeedbackText,
    comparisonFeedbackText,
    critiqueWhere,
    hasLoggedChangeRequests,
    isAlign,
    isApprove,
    isCompare,
    isCritique,
    changeRequestCount,
    selectedApproveArtifactIds,
    selectedComparisonArtifactIds,
  ]);
  const alignResubmitBaseline = useMemo(() => {
    if (!resubmitMode || !isAlign) return null;
    return JSON.stringify({
      text: (existingFeedbackDraft?.feedbackText ?? "").trim(),
      requests: initialChangeRequests.map((entry) => ({
        batchId: entry.batchId,
        artifactIds: [...entry.artifactIds].sort().join(","),
        changesNeeded: entry.changesNeeded.trim(),
      })),
    });
  }, [resubmitMode, isAlign, existingFeedbackDraft, initialChangeRequests]);

  const alignResubmitDirty = useMemo(() => {
    if (!alignResubmitBaseline) return true;
    const current = JSON.stringify({
      text: alignmentFeedbackText.trim(),
      requests: savedChangeRequests.map((entry) => ({
        batchId: entry.batchId,
        artifactIds: [...entry.artifactIds].sort().join(","),
        changesNeeded: entry.changesNeeded.trim(),
      })),
    });
    return current !== alignResubmitBaseline;
  }, [
    alignResubmitBaseline,
    alignmentFeedbackText,
    savedChangeRequests,
  ]);

  const submitDisabled =
    reviewClosed ||
    loading ||
    !currentContributorId ||
    !effectiveReviewerId ||
    (resubmitMode && isAlign && !alignResubmitDirty) ||
    (isAlign
      ? alignmentFeedbackText.trim().length === 0 && changeRequestCount === 0
      : !submitEnabled);

  const submitTooltipLabel = useMemo(() => {
    if (reviewClosed) return "This review is closed";
    if (loading) return "Please wait…";
    if (!currentContributorId) return "Sign in to continue as a reviewer";
    if (!effectiveReviewerId) {
      return isReviewCreator
        ? "Select who you're submitting on behalf of"
        : "Sign in to continue as a reviewer";
    }
    if (isCompare) {
      const parts: string[] = [];
      if (selectedComparisonArtifactIds.length === 0) parts.push("Selected option");
      if (!comparisonFeedbackText.trim()) parts.push("Feedback");
      if (parts.length === 0) return "Complete required fields to proceed";
      return `Complete required fields: ${parts.join(", ")}`;
    }
    if (isApprove) {
      if (selectedApproveArtifactIds.length === 0 && !hasLoggedChangeRequests) {
        return "Select at least one artifact to approve, or request a change";
      }
      return "Complete required fields to proceed";
    }
    if (isAlign) {
      if (alignmentFeedbackText.trim().length === 0 && changeRequestCount === 0) {
        return "Add feedback or a change request to submit";
      }
      return "Complete required fields to proceed";
    }
    if (isCritique) {
      if (!critiqueWhere) return "Select where you provided feedback";
      return "Complete required fields to proceed";
    }
    return "Complete required fields to proceed";
  }, [
    reviewClosed,
    loading,
    currentContributorId,
    isCompare,
    isApprove,
    isAlign,
    isCritique,
    selectedComparisonArtifactIds.length,
    comparisonFeedbackText,
    selectedApproveArtifactIds.length,
    hasLoggedChangeRequests,
    alignmentFeedbackText,
    changeRequestCount,
    critiqueWhere,
    effectiveReviewerId,
    isReviewCreator,
  ]);

  async function handleSubmit() {
    if (submitDisabled) {
      if (!reviewClosed) setFeedbackSubmitAttempted(true);
      return;
    }
    setInlineError(null);
    setLoading(true);
    try {
      const selectedArtifactIds = isCompare
        ? selectedComparisonArtifactIds
        : isApprove
          ? selectedApproveArtifactIds
          : [];
      const feedbackText = isCompare
        ? comparisonFeedbackText
        : isApprove
          ? approveComments
        : isAlign
          ? alignmentFeedbackText
          : isCritique
            ? critiqueGeneralComment
            : "";
      const feedbackLocation = isCritique
        ? critiqueWhere
        : "";

      const result = await submitReviewerFeedbackAction({
        reviewId: review.id,
        reviewerId: effectiveReviewerId,
        feedbackType: reviewType,
        selectedArtifactIds,
        feedbackText,
        feedbackLocation,
        changeRequestBatchIds:
          isApprove || isAlign
            ? [...new Set(savedChangeRequests.map((entry) => entry.batchId).filter(Boolean))]
            : [],
        resubmitMode: resubmitMode && isAlign,
        existingFeedbackId: resubmitMode && isAlign ? existingFeedbackId ?? undefined : undefined,
      });
      if (result.error) {
        setInlineError(result.error);
        return;
      }
      setFeedbackSubmitAttempted(false);
      onSubmitSuccess();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* No full-viewport backdrop: the drawer is a right-side fixed panel so the
          main content (artifact list) remains independently scrollable. Close
          via the header X or Cancel button. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          zIndex: 400,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          boxShadow:
            "-2px 0 4px 0 rgba(41, 33, 28, 0.08), -8px 0 24px 0 rgba(41, 33, 28, 0.18)",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            paddingLeft: 24,
            paddingRight: 12,
            paddingTop: 12,
            paddingBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#6b1e2e" }}>
              {headerTitle}
            </h2>
            <StatusPill
              label={toReviewTypeLabel(reviewType)}
              color="mushroom"
              appearance="filled"
              size="sm"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              width: 32,
              height: 32,
              border: "none",
              borderRadius: 6,
              background: "transparent",
              color: "#2e1c1c",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <div style={{ height: 1, background: "#ede8e0", flexShrink: 0 }} />

        <div
          style={{
            background: "#f3efe9",
            paddingLeft: 24,
            paddingRight: 24,
            paddingTop: 16,
            paddingBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 10,
              fontWeight: 600,
              color: "#998c82",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Review Focus
          </p>
          <p
            ref={focusMeasureRef}
            aria-hidden="true"
            style={{
              position: "absolute",
              visibility: "hidden",
              pointerEvents: "none",
              zIndex: -1,
              margin: 0,
              fontSize: 13,
              fontWeight: 400,
              color: "#6b5e55",
              lineHeight: 1.5,
              letterSpacing: "0.26px",
              width: "calc(100% - 48px)",
            }}
          >
            {focusText}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 400,
              color: "#6b5e55",
              lineHeight: 1.5,
              letterSpacing: "0.26px",
              ...(showFocusAccordion && !focusExpanded
                ? { maxHeight: 80, overflow: "hidden" }
                : {}),
            }}
          >
            {displayFocusText}
          </p>
          {showFocusAccordion ? (
            <div className="flex w-full items-center gap-4 py-1">
              <span className="h-px min-w-0 flex-1 bg-[#e4ddd3]" aria-hidden="true" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon="leading"
                iconName={focusExpanded ? "chevron-up" : "chevron-down"}
                label={focusExpanded ? "Show less" : "Show more"}
                onClick={() => setFocusExpanded((prev) => !prev)}
              />
              <span className="h-px min-w-0 flex-1 bg-[#e4ddd3]" aria-hidden="true" />
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {shouldShowOnBehalfSelect ? (
              <Select
                label="Submitting on behalf of"
                size="sm"
                placeholder="Select a reviewer"
                value={effectiveReviewerId || undefined}
                onChange={setSelectedReviewerId}
                options={dedupedAssignedReviewers.map((reviewer) => ({
                  value: reviewer.id,
                  label: reviewer.name,
                }))}
                errorText={
                  feedbackSubmitAttempted && !effectiveReviewerId
                    ? "Select a reviewer to continue"
                    : undefined
                }
              />
            ) : null}

            {isCompare && (
              <>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#2e1c1c" }}>
                  Select your preferred option*
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {review.artifacts.map((artifact) => (
                    (() => {
                      const artifactIdentifier = artifactTitleStoreKey(artifact);
                      const isSelected = selectedComparisonArtifactIds.includes(artifactIdentifier);
                      return (
                        <div
                          key={artifact.id}
                          style={{
                            border: isSelected ? "1px solid #ffe96c" : "1px solid #e4ddd3",
                            background: "#ffffff",
                            borderRadius: 8,
                            minHeight: 52,
                            padding: "10px 12px",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <Checkbox
                            id={`feedback-artifact-${artifact.id}`}
                            label=""
                            checked={isSelected}
                            onChange={(checked) => {
                              setSelectedComparisonArtifactIds((prev) =>
                                checked
                                  ? prev.includes(artifactIdentifier)
                                    ? prev
                                    : [...prev, artifactIdentifier]
                                  : prev.filter((id) => id !== artifactIdentifier)
                              );
                            }}
                          />
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 13,
                              color: "#2e1c1c",
                            }}
                          >
                            {artifact.label}
                          </span>
                          <Tag
                            label={displayVersion(artifact.iteration)}
                            variant="default"
                            size="sm"
                          />
                        </div>
                      );
                    })()
                  ))}
                </div>
                {feedbackSubmitAttempted && selectedComparisonArtifactIds.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#8b2020" }} role="alert">
                    Select your preferred option
                  </p>
                ) : null}
                <Textarea
                  label="Your feedback*"
                  size="md"
                  variant="form-fixed"
                  value={comparisonFeedbackText}
                  onChange={(event) => setComparisonFeedbackText(event.target.value)}
                  placeholder="Provide your reasons for selecting this option..."
                  state={
                    feedbackSubmitAttempted && !comparisonFeedbackText.trim()
                      ? "error"
                      : "default"
                  }
                  errorText={
                    feedbackSubmitAttempted && !comparisonFeedbackText.trim()
                      ? "Your feedback is required"
                      : undefined
                  }
                />
              </>
            )}

            {isApprove && (
              <div className="flex w-full flex-col gap-4">
                <div className="flex w-full flex-col gap-1.5">
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#2e1c1c",
                    }}
                  >
                    Select which artifacts are approved*
                  </label>
                  <div ref={approveSelectAnchorRef} className="relative w-full">
                    {allArtifactsHaveChangeRequests ? (
                      <Tooltip label="You've requested changes on all artifacts.">
                        <span className="inline-flex w-full">
                          <SelectField
                            label=""
                            type="single"
                            size="sm"
                            placeholder="Select an option"
                            selectedLabel={
                              selectedApproveArtifactIds.length > 0
                                ? undefined
                                : selectedApproveArtifactLabel || undefined
                            }
                            isOpen={approveArtifactsMenuOpen}
                            onOpen={() => setApproveArtifactsMenuOpen((prev) => !prev)}
                            aria-controls="submit-feedback-approve-artifacts-menu"
                            className="!gap-0 w-full [&>label]:hidden"
                            disabled
                            error={
                              feedbackSubmitAttempted &&
                              selectedApproveArtifactIds.length === 0 &&
                              !hasLoggedChangeRequests
                            }
                            errorMessage="Select at least one approved artifact or add a change request"
                          />
                        </span>
                      </Tooltip>
                    ) : (
                      <SelectField
                        label=""
                        type="single"
                        size="sm"
                        placeholder="Select an option"
                        selectedLabel={
                          selectedApproveArtifactIds.length > 0
                            ? undefined
                            : selectedApproveArtifactLabel || undefined
                        }
                        isOpen={approveArtifactsMenuOpen}
                        onOpen={() => setApproveArtifactsMenuOpen((prev) => !prev)}
                        aria-controls="submit-feedback-approve-artifacts-menu"
                        className="!gap-0 w-full [&>label]:hidden"
                        error={
                          feedbackSubmitAttempted &&
                          selectedApproveArtifactIds.length === 0 &&
                          !hasLoggedChangeRequests
                        }
                        errorMessage="Select at least one approved artifact or add a change request"
                      />
                    )}
                    <Menu
                      id="submit-feedback-approve-artifacts-menu"
                      open={!allArtifactsHaveChangeRequests && approveArtifactsMenuOpen}
                      onClose={() => setApproveArtifactsMenuOpen(false)}
                      anchorRef={approveSelectAnchorRef}
                      align="left"
                      type="multi-select"
                    >
                      <li role="none" className="list-none px-3 py-2">
                        <label className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            label=""
                            checked={
                              approveArtifactMenuOptions.length > 0 &&
                              approveArtifactMenuOptions.every((artifact) =>
                                selectedApproveArtifactIds.includes(
                                  artifactTitleStoreKey(artifact),
                                ),
                              )
                            }
                            onChange={(checked) => {
                              const allKeys = approveArtifactMenuOptions.map((artifact) =>
                                artifactTitleStoreKey(artifact),
                              );
                              setSelectedApproveArtifactIds(checked ? allKeys : []);
                            }}
                          />
                          <span className="text-[13px] text-[#2e1c1c]">All</span>
                        </label>
                      </li>
                      <li role="none" className="list-none px-3 py-1">
                        <Divider className="w-full" />
                      </li>
                      {approveArtifactMenuOptions.map((artifact) => {
                        const artifactIdentifier = artifactTitleStoreKey(artifact);
                        const isSelected =
                          selectedApproveArtifactIds.includes(artifactIdentifier);
                        return (
                          <li key={artifact.id} role="none" className="list-none px-3 py-2">
                            <label className="flex cursor-pointer items-center gap-2">
                              <Checkbox
                                label=""
                                checked={isSelected}
                                onChange={(checked) => {
                                  setSelectedApproveArtifactIds((prev) =>
                                    checked
                                      ? prev.includes(artifactIdentifier)
                                        ? prev
                                        : [...prev, artifactIdentifier]
                                      : prev.filter((id) => id !== artifactIdentifier),
                                  );
                                  if (checked) {
                                    setSavedChangeRequests((prev) => {
                                      const next = prev
                                        .map((entry) => ({
                                          ...entry,
                                          artifactIds: entry.artifactIds.filter(
                                            (id) => id !== artifactIdentifier,
                                          ),
                                        }))
                                        .filter((entry) => entry.artifactIds.length > 0);
                                      setChangeRequestCount(next.length);
                                      return next;
                                    });
                                  }
                                }}
                              />
                              <span className="min-w-0 flex-1 text-[13px] text-[#2e1c1c]">
                                {artifact.label}
                              </span>
                              <Tag
                                label={displayVersion(artifact.iteration)}
                                variant="default"
                                size="sm"
                              />
                            </label>
                          </li>
                        );
                      })}
                    </Menu>
                  </div>
                  {feedbackSubmitAttempted &&
                  selectedApproveArtifactIds.length === 0 &&
                  !hasLoggedChangeRequests ? (
                    <p style={{ margin: 0, fontSize: 12, color: "#8b2020" }} role="alert">
                      Select at least one artifact to approve, or request a change
                    </p>
                  ) : null}
                </div>

                {selectedApproveArtifactIds.length > 0 ? (
                  <div className="flex w-full flex-col gap-2">
                    {review.artifacts
                      .filter((artifact) =>
                        selectedApproveArtifactIds.includes(artifactTitleStoreKey(artifact)),
                      )
                      .map((artifact) => (
                        <div
                          key={artifact.id}
                          className="flex h-[52px] w-full items-center gap-2 rounded-[8px] border border-solid border-[#c9c0b4] bg-[#fff6d7] px-3"
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#6b1e2e]">
                            {artifact.label}
                          </span>
                          <Tag
                            label={displayVersion(artifact.iteration)}
                            variant="brand"
                            size="sm"
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${artifact.label}`}
                            className="inline-flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-[#6b1e2e] cursor-pointer"
                            onClick={() =>
                              setSelectedApproveArtifactIds((prev) =>
                                prev.filter((id) => id !== artifactTitleStoreKey(artifact)),
                              )
                            }
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                      ))}
                  </div>
                ) : null}

                {selectedApproveArtifactIds.length > 0 ? (
                  <div className="flex w-full flex-col gap-[6px]">
                    <p className="m-0 text-[13px] font-medium tracking-[0.26px] text-[var(--text/primary,#2e1c1c)]">
                      Any comments to add to these approvals?
                    </p>
                    <Textarea
                      label=""
                      showLabel={false}
                      size="md"
                      placeholder="Add your comments..."
                      value={approveComments}
                      onChange={(event) => setApproveComments(event.target.value)}
                      fieldShellOuterClassName="[&_textarea]:min-h-[100px]"
                    />
                  </div>
                ) : null}

                <div className="flex w-full items-center gap-2">
                  <div className="h-px min-w-0 flex-1 bg-[#e4ddd3]" />
                  <span className="shrink-0 text-[12px] text-[#998c82]">OR</span>
                  <div className="h-px min-w-0 flex-1 bg-[#e4ddd3]" />
                </div>

                {hasLoggedChangeRequests ? (
                  <div className="flex w-full flex-col gap-2 items-start">
                    <label className="text-[13px] font-medium text-[#2e1c1c]">Changes</label>
                    <div className="flex w-full flex-col gap-1">
                      {mappedSavedChanges.map((problem, index) => (
                        <div
                          key={problem.id}
                          className="flex w-full min-h-[40px] items-center gap-2 rounded-[4px] border border-[#e4ddd3] bg-[#f3efe9] px-3 py-2"
                        >
                          <span className="shrink-0 text-[13px] font-medium text-[#6b5e55]">
                            {index + 1}.
                          </span>
                          <span className="min-w-0 flex-1 text-[13px] font-medium text-[#2e1c1c]">
                            {problem.description}
                          </span>
                          <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
                            <Tag
                              label={`Change ${index + 1}`}
                              variant="butter"
                              size="sm"
                            />
                            {problem.artifactLabels.map((label) => (
                              <Tag
                                key={`${problem.id}-${label}`}
                                label={label}
                                variant="neutral"
                                size="sm"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      label="Another change request"
                      variant="ghost"
                      size="sm"
                      icon="leading"
                      iconName="plus"
                      onClick={() => setShowChangeRequestModal(true)}
                    />
                  </div>
                ) : (
                  <Tooltip
                    label={
                      allArtifactsApproved
                        ? "You have already approved all artifacts"
                        : "Request changes on artifacts you have not approved"
                    }
                  >
                    <span className="inline-flex w-full">
                      <Button
                        label="Request a change"
                        variant="accent"
                        size="md"
                        fullWidth
                        className="w-full"
                        disabled={allArtifactsApproved}
                        aria-disabled={allArtifactsApproved}
                        onClick={() => {
                          if (allArtifactsApproved) return;
                          setApproveRequestedChange(true);
                          setShowChangeRequestModal(true);
                        }}
                      />
                    </span>
                  </Tooltip>
                )}
              </div>
            )}

            {isAlign && (
              <>
                <Textarea
                  label="Was there anything you wanted to call out?*"
                  size="md"
                  variant="form-fixed"
                  value={alignmentFeedbackText}
                  onChange={(event) => setAlignmentFeedbackText(event.target.value)}
                  placeholder="Add your comments..."
                  state={
                    feedbackSubmitAttempted &&
                    alignmentFeedbackText.trim().length === 0 &&
                    changeRequestCount === 0
                      ? "error"
                      : "default"
                  }
                  errorText={
                    feedbackSubmitAttempted &&
                    alignmentFeedbackText.trim().length === 0 &&
                    changeRequestCount === 0
                      ? "Feedback or a change request is required"
                      : undefined
                  }
                />
                {!hasLoggedChangeRequests ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ height: 1, background: "#e4ddd3", flex: 1 }} />
                      <span style={{ fontSize: 12, color: "#998c82" }}>OR</span>
                      <div style={{ height: 1, background: "#e4ddd3", flex: 1 }} />
                    </div>
                    <Button
                      label="Request a change"
                      variant="accent"
                      size="md"
                      fullWidth
                      className="w-full"
                      onClick={() => {
                        setAlignRequestedChange(true);
                        setShowChangeRequestModal(true);
                      }}
                    />
                  </>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: "#2e1c1c" }}>
                      Changes
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                      {mappedSavedChanges.map((problem, index) => (
                        <div
                          key={problem.id}
                          className="flex w-full min-h-[40px] items-center gap-2 rounded-[4px] border border-[#e4ddd3] bg-[#f3efe9] px-3 py-2"
                        >
                          <span className="shrink-0 text-[13px] font-medium text-[#6b5e55]">
                            {index + 1}.
                          </span>
                          <span className="min-w-0 flex-1 text-[13px] font-medium text-[#2e1c1c]">
                            {problem.description}
                          </span>
                          <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
                            <Tag
                              label={`Change ${index + 1}`}
                              variant="butter"
                              size="sm"
                            />
                            {problem.artifactLabels.map((label) => (
                              <Tag
                                key={`${problem.id}-${label}`}
                                label={label}
                                variant="neutral"
                                size="sm"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      label="Another change request"
                      variant="ghost"
                      size="sm"
                      icon="leading"
                      iconName="plus"
                      onClick={() => setShowChangeRequestModal(true)}
                    />
                  </div>
                )}
              </>
            )}

            {isCritique && (
              <>
                <Select
                  label="Where have you provided feedback?*"
                  size="sm"
                  placeholder="Select an option"
                  value={critiqueWhere || undefined}
                  onChange={setCritiqueWhere}
                  options={CRITIQUE_WHERE_OPTIONS}
                  errorText={
                    feedbackSubmitAttempted && !critiqueWhere
                      ? "Where you provided feedback is required"
                      : undefined
                  }
                />
                <Textarea
                  label="Was there any general comments you would like to add?"
                  size="md"
                  variant="form-fixed"
                  value={critiqueGeneralComment}
                  onChange={(event) => setCritiqueGeneralComment(event.target.value)}
                  placeholder="Add your comments..."
                />
              </>
            )}
          </div>
        </div>

        <div style={{ height: 1, background: "#e4ddd3", flexShrink: 0 }} />
        <div
          style={{
            flexShrink: 0,
            paddingLeft: 24,
            paddingRight: 24,
            paddingTop: 16,
            paddingBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#6b5e55" }}>
            {reviewClosed ? "" : "Required*"}
          </span>
          {reviewClosed ? (
            <span style={{ fontSize: 13, color: "#6b5e55", marginRight: "auto", flex: 1 }}>
              This review has been closed.
            </span>
          ) : null}
          {!reviewClosed && inlineError ? (
            <span style={{ fontSize: 12, color: "#8b2020", marginRight: "auto" }}>
              {inlineError}
            </span>
          ) : null}
          <Button label="Cancel" variant="secondary" size="sm" onClick={onClose} />
          <div
            onPointerDownCapture={() => {
              if (submitDisabled && !reviewClosed) setFeedbackSubmitAttempted(true);
            }}
            style={{ display: "inline-flex" }}
          >
            {!submitDisabled ? (
              <Button
                label={
                  loading ? "Submitting…" : footerPrimaryLabel
                }
                variant="primary"
                size="sm"
                onClick={() => {
                  void handleSubmit();
                }}
              />
            ) : (
              <Tooltip label={submitTooltipLabel}>
                <span style={{ display: "inline-flex" }}>
                  <Button
                    label={
                      loading ? "Submitting…" : footerPrimaryLabel
                    }
                    variant="primary"
                    size="sm"
                    disabled
                    aria-disabled
                  />
                </span>
              </Tooltip>
            )}
          </div>
        </div>
      </aside>
      {showChangeRequestModal && currentContributorId && effectiveReviewerId && (
        <ChangeRequestModal
          reviewId={review.id}
          reviewerContributorId={effectiveReviewerId}
          artifacts={changeRequestArtifacts}
          deferRevalidate={deferRevalidate}
          onClose={(savedEntries) => {
            setShowChangeRequestModal(false);
            if (!savedEntries?.length) return;
            const addedKeys = new Set(
              savedEntries.flatMap((entry) => entry.artifactIds),
            );
            setSelectedApproveArtifactIds((prev) =>
              prev.filter((id) => !addedKeys.has(id)),
            );
            setSavedChangeRequests((prev) => [...prev, ...savedEntries]);
            setChangeRequestCount((prev) => prev + savedEntries.length);
            onChangeRequestCreated?.();
          }}
        />
      )}
    </>
  );
}
