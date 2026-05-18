"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Icon,
  Input,
  Select,
  ShowAccordion,
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

type SubmitFeedbackDrawerProps = {
  review: DrawerReview;
  /** When the review lifecycle is `complete` — no further submissions. */
  reviewClosed?: boolean;
  /** Pre-fill when the reviewer already has a submitted `reviewer_feedback` row. */
  existingFeedbackDraft?: {
    feedbackText: string;
    selectedOption: string | null;
  } | null;
  currentContributorId: string | null;
  onClose: () => void;
  onSubmitSuccess: () => void;
};

type SavedChangeRequest = {
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
  currentContributorId,
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
  const approveSearchRef = useRef<HTMLDivElement | null>(null);
  const [approveSearch, setApproveSearch] = useState("");
  const [approveMenuOpen, setApproveMenuOpen] = useState(false);

  const [selectedComparisonArtifactIds, setSelectedComparisonArtifactIds] =
    useState<string[]>([]);
  const [comparisonFeedbackText, setComparisonFeedbackText] = useState("");

  const [selectedApproveArtifactIds, setSelectedApproveArtifactIds] = useState<string[]>(
    []
  );
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
  const footerPrimaryLabel = isEditing ? "Update feedback" : "Submit feedback";
  const headerTitle = isEditing ? "Edit your feedback" : "Submit Feedback";
  const dialogLabel = isEditing ? "Edit your feedback" : "Submit Feedback";
  const focusText = review.reviewFocus || "No review focus provided.";
  const displayFocusText = focusExpanded ? focusText : focusText;

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
    function onPointerDown(e: PointerEvent) {
      if (!approveMenuOpen) return;
      if (!approveSearchRef.current?.contains(e.target as Node)) {
        setApproveMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [approveMenuOpen]);

  useEffect(() => {
    if (!isAlign) return;
    console.info("[submit-feedback-drawer] align-validation", {
      alignmentFeedbackText,
      trimmedLength: alignmentFeedbackText.trim().length,
      changeRequestCount,
    });
  }, [isAlign, alignmentFeedbackText, changeRequestCount]);

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
    } else if (isAlign) {
      setAlignmentFeedbackText(text);
    } else if (isCritique) {
      const known = CRITIQUE_WHERE_OPTIONS.some((o) => o.value === opt);
      if (known) setCritiqueWhere(opt);
      setCritiqueGeneralComment(text);
    }
  }, [existingFeedbackDraft, isCompare, isApprove, isAlign, isCritique, review.id]);

  const filteredApproveArtifacts = review.artifacts.filter(
    (artifact) =>
      !selectedApproveArtifactIds.includes(artifactTitleStoreKey(artifact)) &&
      artifact.label.toLowerCase().includes(approveSearch.trim().toLowerCase())
  );
  const mappedSavedChanges = savedChangeRequests.map((entry, index) => ({
    id: `saved-change-${index}`,
    description:
      entry.changesNeeded.trim() || entry.artifactIds.join(", ") || "Change request",
  }));
  const hasLoggedChangeRequests = changeRequestCount > 0;

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
  const submitDisabled =
    reviewClosed ||
    loading ||
    !currentContributorId ||
    (isAlign
      ? alignmentFeedbackText.trim().length === 0 && changeRequestCount === 0
      : !submitEnabled);

  const submitTooltipLabel = useMemo(() => {
    if (reviewClosed) return "This review is closed";
    if (loading) return "Please wait…";
    if (!currentContributorId) return "Sign in to continue as a reviewer";
    if (isCompare) {
      const parts: string[] = [];
      if (selectedComparisonArtifactIds.length === 0) parts.push("Selected option");
      if (!comparisonFeedbackText.trim()) parts.push("Feedback");
      if (parts.length === 0) return "Complete required fields to proceed";
      return `Complete required fields: ${parts.join(", ")}`;
    }
    if (isApprove) {
      if (selectedApproveArtifactIds.length === 0 && !hasLoggedChangeRequests) {
        return "Select artifacts or add a change request";
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
        reviewerId: currentContributorId,
        feedbackType: reviewType,
        selectedArtifactIds,
        feedbackText,
        feedbackLocation,
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
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 399, background: "transparent" }}
      />
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
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#6b1e2e" }}>
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
              display: "-webkit-box",
              WebkitLineClamp: focusExpanded ? "unset" : 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {displayFocusText}
          </p>
          {showFocusAccordion ? (
            <ShowAccordion
              state={focusExpanded ? "less" : "more"}
              onClick={() => setFocusExpanded((prev) => !prev)}
            />
          ) : null}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                          <Tag label={artifact.iteration} variant="default" size="sm" />
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
              <>
                <div ref={approveSearchRef} style={{ position: "relative" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#2e1c1c",
                    }}
                  >
                    Select which artifacts are approved*
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      placeholder="Find artifacts"
                      value={approveSearch}
                      onChange={(e) => {
                        setApproveSearch(e.target.value);
                        setApproveMenuOpen(true);
                      }}
                      onFocus={() => setApproveMenuOpen(true)}
                      style={{
                        height: 32,
                        width: "100%",
                        border: "1px solid #6b1e2e",
                        borderRadius: 6,
                        padding: "0 30px 0 8px",
                        fontSize: 13,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        color: "#2e1c1c",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#998c82",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      <Icon name="search" size={14} />
                    </span>
                  </div>
                  {approveMenuOpen && filteredApproveArtifacts.length > 0 ? (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        maxHeight: 180,
                        overflowY: "auto",
                        border: "1px solid #e4ddd3",
                        borderRadius: 8,
                        background: "#ffffff",
                        boxShadow: "0px 8px 16px rgba(41,33,28,0.15)",
                        zIndex: 5,
                      }}
                    >
                      {filteredApproveArtifacts.map((artifact) => (
                        <button
                          key={artifact.id}
                          type="button"
                          onClick={() => {
                            const artifactIdentifier = artifactTitleStoreKey(artifact);
                            setSelectedApproveArtifactIds((prev) =>
                              prev.includes(artifactIdentifier)
                                ? prev
                                : [...prev, artifactIdentifier]
                            );
                            setApproveSearch("");
                          }}
                          style={{
                            width: "100%",
                            border: "none",
                            background: "transparent",
                            textAlign: "left",
                            padding: "8px 12px",
                            fontSize: 13,
                            color: "#2e1c1c",
                            cursor: "pointer",
                          }}
                        >
                          {artifact.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {selectedApproveArtifactIds.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {review.artifacts
                        .filter((artifact) =>
                          selectedApproveArtifactIds.includes(artifactTitleStoreKey(artifact))
                        )
                        .map((artifact) => (
                          <div
                            key={artifact.id}
                            style={{
                              height: 32,
                              padding: "0 8px",
                              borderRadius: 4,
                              border: "1px solid #e4ddd3",
                              background: "#f3efe9",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span style={{ fontSize: 13, color: "#6b5e55", fontWeight: 500 }}>
                              {artifact.label}
                            </span>
                            <Tag label={artifact.iteration} variant="default" size="sm" />
                            <button
                              type="button"
                              aria-label={`Remove ${artifact.label}`}
                              onClick={() =>
                                setSelectedApproveArtifactIds((prev) =>
                                  prev.filter((id) => id !== artifactTitleStoreKey(artifact))
                                )
                              }
                              style={{
                                marginLeft: "auto",
                                border: "none",
                                background: "transparent",
                                padding: 0,
                                width: 16,
                                height: 16,
                                color: "#998c82",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                              }}
                            >
                              <Icon name="close" size={16} />
                            </button>
                          </div>
                        ))}
                    </div>
                  ) : null}
                </div>
                {feedbackSubmitAttempted &&
                selectedApproveArtifactIds.length === 0 &&
                !hasLoggedChangeRequests ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#8b2020" }} role="alert">
                    Select at least one approved artifact or add a change request
                  </p>
                ) : null}
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
                      className="w-full"
                      onClick={() => {
                        setApproveRequestedChange(true);
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
                          style={{
                            width: "100%",
                            height: 40,
                            display: "flex",
                            alignItems: "center",
                            background: "#f3efe9",
                            border: "1px solid #e4ddd3",
                            borderRadius: 4,
                            padding: "0 10px 0 12px",
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              color: "#6b5e55",
                              fontSize: 13,
                              fontWeight: 500,
                              flexShrink: 0,
                              marginRight: 8,
                            }}
                          >
                            {index + 1}.
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#2e1c1c",
                              textAlign: "left",
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {problem.description}
                          </span>
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
                          style={{
                            width: "100%",
                            height: 40,
                            display: "flex",
                            alignItems: "center",
                            background: "#f3efe9",
                            border: "1px solid #e4ddd3",
                            borderRadius: 4,
                            padding: "0 10px 0 12px",
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              color: "#6b5e55",
                              fontSize: 13,
                              fontWeight: 500,
                              flexShrink: 0,
                              marginRight: 8,
                            }}
                          >
                            {index + 1}.
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#2e1c1c",
                              textAlign: "left",
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {problem.description}
                          </span>
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
                  loading
                    ? isEditing
                      ? "Updating…"
                      : "Submitting…"
                    : footerPrimaryLabel
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
                      loading
                        ? isEditing
                          ? "Updating…"
                          : "Submitting…"
                        : footerPrimaryLabel
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
      {showChangeRequestModal && currentContributorId && (
        <ChangeRequestModal
          reviewId={review.id}
          reviewerContributorId={currentContributorId}
          artifacts={review.artifacts}
          onClose={(savedEntries) => {
            setShowChangeRequestModal(false);
            if (!savedEntries?.length) return;
            setSavedChangeRequests((prev) => [...prev, ...savedEntries]);
            setChangeRequestCount((prev) => prev + savedEntries.length);
          }}
        />
      )}
    </>
  );
}
