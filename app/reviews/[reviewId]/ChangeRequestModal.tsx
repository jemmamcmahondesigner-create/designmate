"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Icon, Tag, Textarea, Tooltip } from "@/components/ui/ds";
import { createChangeRequestAction } from "./actions";

type ChangeRequestArtifact = {
  id: string;
  title?: string | null;
  label: string;
  iteration?: string;
};

type ChangeRequestModalProps = {
  reviewId: string;
  reviewerContributorId: string;
  artifacts: ChangeRequestArtifact[];
  onClose: (savedEntries?: { artifactIds: string[]; changesNeeded: string }[]) => void;
};

/** Stored in `change_requests.artifact_ids` — title only. */
function artifactTitleStoreKey(artifact: ChangeRequestArtifact) {
  const title = artifact.title?.trim() ?? "";
  return title;
}

export function ChangeRequestModal({
  reviewId,
  reviewerContributorId,
  artifacts,
  onClose,
}: ChangeRequestModalProps) {
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
  const [changesNeeded, setChangesNeeded] = useState("");
  const [createAnother, setCreateAnother] = useState(false);
  const [artifactSearch, setArtifactSearch] = useState("");
  const [artifactMenuOpen, setArtifactMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [changesAddedCount, setChangesAddedCount] = useState(0);
  const artifactSearchRef = useRef<HTMLDivElement | null>(null);
  const [savedEntries, setSavedEntries] = useState<
    { artifactIds: string[]; changesNeeded: string }[]
  >([]);
  const [batchId] = useState(() => crypto.randomUUID());

  const addEnabled = selectedArtifactIds.length > 0 && !loading;
  const isAdditionalEntry = changesAddedCount > 0;
  const totalCount = changesAddedCount + 1;
  const filteredArtifacts = useMemo(() => {
    const q = artifactSearch.trim().toLowerCase();
    return artifacts.filter((artifact) => {
      const key = artifactTitleStoreKey(artifact);
      if (selectedArtifactIds.includes(key)) return false;
      if (!q) return true;
      const label = artifact.label.toLowerCase();
      const title = (artifact.title ?? "").trim().toLowerCase();
      return label.includes(q) || title.includes(q);
    });
  }, [artifacts, artifactSearch, selectedArtifactIds]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!artifactMenuOpen) return;
      if (!artifactSearchRef.current?.contains(e.target as Node)) {
        setArtifactMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [artifactMenuOpen]);

  function closeModal() {
    onClose(savedEntries.length > 0 ? savedEntries : undefined);
  }

  async function handleAdd() {
    if (!addEnabled) return;
    setInlineError(null);
    setLoading(true);
    try {
      const result = await createChangeRequestAction({
        reviewId,
        reviewerId: reviewerContributorId,
        artifactIds: selectedArtifactIds,
        changesNeeded,
        batchId,
      });
      if (result.error) {
        setInlineError(result.error);
        return;
      }
      const nextEntry = {
        artifactIds: selectedArtifactIds,
        changesNeeded: changesNeeded.trim(),
      };
      if (createAnother) {
        setSavedEntries((prev) => [...prev, nextEntry]);
        setSelectedArtifactIds([]);
        setChangesNeeded("");
        setArtifactSearch("");
        setArtifactMenuOpen(false);
        setChangesAddedCount((prev) => prev + 1);
        setCreateAnother(false);
        return;
      }
      onClose([...savedEntries, nextEntry]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(41,33,28,0.4)",
          zIndex: 510,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create a Change Request"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 511,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 560,
            background: "#ffffff",
            borderRadius: 16,
            boxShadow:
              "0px 4px 8px rgba(41,33,28,0.08), 0px 16px 32px rgba(41,33,28,0.2)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            pointerEvents: "auto",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          <div
            style={{
              padding: "12px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#6b1e2e" }}>
                Create a Change Request
              </h2>
              {isAdditionalEntry ? (
                <span style={{ fontSize: 12, color: "#6b5e55" }}>
                  {changesAddedCount + 1} of {changesAddedCount + 1} changes
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close modal"
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
          <div style={{ height: 1, background: "#ede8e0" }} />

          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#2e1c1c" }}>
                Select relevant artifacts*
              </label>
              <div
                ref={artifactSearchRef}
                style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Find artifacts"
                    value={artifactSearch}
                    onChange={(e) => {
                      setArtifactSearch(e.target.value);
                      setArtifactMenuOpen(true);
                    }}
                    onFocus={() => setArtifactMenuOpen(true)}
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
                {artifactMenuOpen && filteredArtifacts.length > 0 ? (
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
                    {filteredArtifacts.map((artifact) => (
                      <button
                        key={artifact.id}
                        type="button"
                        onClick={() => {
                          const key = artifactTitleStoreKey(artifact);
                          if (!key) return;
                          setSelectedArtifactIds((prev) =>
                            prev.includes(key) ? prev : [...prev, key]
                          );
                          setArtifactSearch("");
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
                        {artifact.title?.trim() || artifact.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {selectedArtifactIds.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {artifacts
                      .filter((artifact) =>
                        artifactTitleStoreKey(artifact) !== "" &&
                        selectedArtifactIds.includes(artifactTitleStoreKey(artifact))
                      )
                      .map((artifact) => (
                        <div
                          key={artifact.id}
                          style={{
                            height: 32,
                            padding: "0 8px",
                            borderRadius: 4,
                            border: "1px solid #e07070",
                            background: "#fceaea",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 13, color: "#6b1e2e", fontWeight: 500 }}>
                            {artifact.title?.trim() || artifact.id}
                          </span>
                          <Tag label={artifact.iteration ?? "v1"} variant="brand" size="sm" />
                          <button
                            type="button"
                            aria-label={`Remove ${artifact.title?.trim() || artifact.id}`}
                            onClick={() =>
                              setSelectedArtifactIds((prev) =>
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
                              color: "#6b1e2e",
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
            </div>

            <Textarea
              label="What changes are needed?"
              size="md"
              variant="form-fixed"
              placeholder="List all relevant changes..."
              value={changesNeeded}
              onChange={(event) => setChangesNeeded(event.target.value)}
            />

            <Checkbox
              id="create-another-change-request"
              label="Create another change request"
              checked={createAnother}
              onChange={setCreateAnother}
            />
          </div>

          <div style={{ height: 1, background: "#ede8e0" }} />
          <div
            style={{
              padding: "16px 24px 20px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#6b5e55" }}>
              Required*
            </span>
            {inlineError ? (
              <span style={{ fontSize: 12, color: "#8b2020", marginRight: "auto" }}>
                {inlineError}
              </span>
            ) : null}
            {isAdditionalEntry ? (
              <Button
                label="Back"
                variant="secondary"
                size="sm"
                icon="leading"
                iconName="chevron-left"
                onClick={() => setChangesAddedCount((prev) => Math.max(0, prev - 1))}
              />
            ) : null}
            <Button label="Cancel" variant="secondary" size="sm" onClick={closeModal} />
            {!addEnabled ? (
              <Tooltip label="Select at least one artifact to continue">
                <span style={{ display: "inline-flex" }}>
                  <Button
                    label={
                      loading
                        ? "Adding…"
                        : createAnother && changesAddedCount === 0
                          ? "Next"
                          : totalCount > 1
                            ? `Add (${totalCount})`
                            : "Add"
                    }
                    icon={createAnother && changesAddedCount === 0 ? "trailing" : "none"}
                    iconName={
                      createAnother && changesAddedCount === 0 ? "chevron-right" : undefined
                    }
                    variant={!isAdditionalEntry && addEnabled ? "accent" : "primary"}
                    size="sm"
                    disabled
                    aria-disabled
                  />
                </span>
              </Tooltip>
            ) : (
              <Button
                label={
                  loading
                    ? "Adding…"
                    : createAnother && changesAddedCount === 0
                      ? "Next"
                      : totalCount > 1
                        ? `Add (${totalCount})`
                        : "Add"
                }
                icon={createAnother && changesAddedCount === 0 ? "trailing" : "none"}
                iconName={createAnother && changesAddedCount === 0 ? "chevron-right" : undefined}
                variant={!isAdditionalEntry && addEnabled ? "accent" : "primary"}
                size="sm"
                onClick={() => {
                  void handleAdd();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
