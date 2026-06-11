"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Icon,
  Menu,
  SelectField,
  Tag,
  Textarea,
  Tooltip,
} from "@/components/ui/ds";
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
  /** Defer server revalidation until the parent feedback drawer closes. */
  deferRevalidate?: boolean;
  /** When false, keep entries in the drawer only until the parent submits (e.g. Final Decision). */
  persistToDatabase?: boolean;
  onClose: (savedEntries?: { batchId: string; artifactIds: string[]; changesNeeded: string }[]) => void;
};

/** Stored in `change_requests.artifact_ids` — title only. */
function artifactTitleStoreKey(artifact: ChangeRequestArtifact) {
  const title = artifact.title?.trim() ?? "";
  return title;
}

function displayVersion(label: string | null | undefined) {
  return label?.replace(/^Iteration\s+(\d+)$/i, "v$1") ?? label ?? "";
}

export function ChangeRequestModal({
  reviewId,
  reviewerContributorId,
  artifacts,
  deferRevalidate = false,
  persistToDatabase = true,
  onClose,
}: ChangeRequestModalProps) {
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
  const [changesNeeded, setChangesNeeded] = useState("");
  const [createAnother, setCreateAnother] = useState(false);
  const [artifactMenuOpen, setArtifactMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [changesAddedCount, setChangesAddedCount] = useState(0);
  const artifactSelectRef = useRef<HTMLDivElement | null>(null);
  const [savedEntries, setSavedEntries] = useState<
    { batchId: string; artifactIds: string[]; changesNeeded: string }[]
  >([]);
  const [batchId] = useState(() => crypto.randomUUID());

  const addEnabled =
    selectedArtifactIds.length > 0 && changesNeeded.trim().length > 0 && !loading;
  const showDisabledTooltip = !addEnabled && !loading;
  const isAdditionalEntry = changesAddedCount > 0;
  const totalCount = changesAddedCount + 1;
  const availableArtifacts = useMemo(
    () =>
      artifacts.filter((artifact) => {
        const key = artifactTitleStoreKey(artifact);
        return key !== "" && !selectedArtifactIds.includes(key);
      }),
    [artifacts, selectedArtifactIds],
  );

  function closeModal() {
    onClose(savedEntries.length > 0 ? savedEntries : undefined);
  }

  async function handleAdd() {
    if (!addEnabled) return;
    setInlineError(null);
    const nextEntry = {
      batchId,
      artifactIds: selectedArtifactIds,
      changesNeeded: changesNeeded.trim(),
    };
    if (!persistToDatabase) {
      if (createAnother) {
        setSavedEntries((prev) => [...prev, nextEntry]);
        setSelectedArtifactIds([]);
        setChangesNeeded("");
        setArtifactMenuOpen(false);
        setChangesAddedCount((prev) => prev + 1);
        setCreateAnother(false);
        return;
      }
      onClose([...savedEntries, nextEntry]);
      return;
    }
    setLoading(true);
    try {
      const result = await createChangeRequestAction({
        reviewId,
        reviewerId: reviewerContributorId,
        artifactIds: selectedArtifactIds,
        changesNeeded,
        batchId,
        deferRevalidate,
      });
      if (result.error) {
        setInlineError(result.error);
        return;
      }
      if (createAnother) {
        setSavedEntries((prev) => [...prev, nextEntry]);
        setSelectedArtifactIds([]);
        setChangesNeeded("");
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
                ref={artifactSelectRef}
                style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <SelectField
                  label=""
                  type="single"
                  size="sm"
                  placeholder="Select an option"
                  selectedLabel={
                    selectedArtifactIds.length > 0
                      ? artifacts.find(
                          (artifact) =>
                            selectedArtifactIds[0] === artifactTitleStoreKey(artifact),
                        )?.label
                      : undefined
                  }
                  isOpen={artifactMenuOpen}
                  onOpen={() => setArtifactMenuOpen((open) => !open)}
                  aria-controls="change-request-artifact-menu"
                  className="!gap-0 [&>label]:hidden"
                />
                <Menu
                  id="change-request-artifact-menu"
                  open={artifactMenuOpen}
                  onClose={() => setArtifactMenuOpen(false)}
                  anchorRef={artifactSelectRef}
                  align="left"
                >
                  {availableArtifacts.length === 0 ? (
                    <li role="none" className="list-none px-3 py-2 text-[13px] text-[#998c82]">
                      No artifacts available
                    </li>
                  ) : (
                    availableArtifacts.map((artifact) => (
                      <li key={artifact.id} role="none" className="list-none">
                        <button
                          type="button"
                          className="w-full border-0 bg-transparent px-3 py-2 text-left text-[13px] text-[#2e1c1c] cursor-pointer hover:bg-[#f3efe9]"
                          onClick={() => {
                            const key = artifactTitleStoreKey(artifact);
                            if (!key) return;
                            setSelectedArtifactIds([key]);
                            setArtifactMenuOpen(false);
                          }}
                        >
                          {artifact.label}
                        </button>
                      </li>
                    ))
                  )}
                </Menu>
                {selectedArtifactIds.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {artifacts
                      .filter(
                        (artifact) =>
                          artifactTitleStoreKey(artifact) !== "" &&
                          selectedArtifactIds.includes(artifactTitleStoreKey(artifact)),
                      )
                      .map((artifact) => (
                        <div
                          key={artifact.id}
                          style={{
                            height: 52,
                            padding: "0 12px",
                            borderRadius: 8,
                            border: "1px solid #fff0a3",
                            background: "#fff6d7",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              color: "#6b1e2e",
                              fontWeight: 500,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {artifact.label}
                          </span>
                          <Tag
                            label={displayVersion(artifact.iteration ?? "v1")}
                            variant="brand"
                            size="sm"
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${artifact.label}`}
                            onClick={() =>
                              setSelectedArtifactIds((prev) =>
                                prev.filter((id) => id !== artifactTitleStoreKey(artifact)),
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
              label="What changes are needed?*"
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
            {showDisabledTooltip ? (
              <Tooltip label="Select an artifact and describe the changes to continue">
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
                disabled={!addEnabled}
                aria-disabled={!addEnabled}
                onClick={() => {
                  if (!addEnabled) return;
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
