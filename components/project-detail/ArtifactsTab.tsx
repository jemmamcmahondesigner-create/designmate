"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArtifactPreview,
  Avatar,
  Button,
  IconSquareButton,
  Menu,
  MenuItem,
  StatusPill,
  Table,
  Tooltip,
  TruncatedTooltip,
  type ArtifactPreviewFileType,
  type ColumnDef,
  type StatusPillColor,
} from "@/components/ui/ds";
import { formatDistanceToNow } from "@/lib/formatDistanceToNow";
import { resolveReviewStatusPill } from "@/lib/reviews/reviewStatusDisplay";
import artifactStyles from "@/components/project-detail/ArtifactsTab.module.css";
import panelEmptyStateStyles from "@/components/project-detail/projectPanelEmptyState.module.css";
import type {
  ProjectArtifactHistoryVersion,
  ProjectArtifactOverviewRow,
  ProjectArtifactsTabPayload,
} from "@/lib/projects/loadProjectArtifactsTab";

const BORDER = "var(--border-default, #e4ddd3)";
const BORDER_SUBTLE = "var(--border-subtle, #ede8e0)";
const TEXT_HEADING = "var(--text-heading, #6b1e2e)";
const TEXT_SECONDARY = "var(--text-secondary, #6b5e55)";
const TEXT_TERTIARY = "var(--text-tertiary, #998c82)";
const TEXT_DISABLED = "var(--text-disabled, #c9c0b4)";
const TEXT_LINK = "var(--text-link, #6b1e2e)";
const TEXT_PRIMARY = "var(--text-primary, #2e1c1c)";

type ArtifactTableRow = ProjectArtifactOverviewRow & { id: string };

function renderReviewStatusPill(row: ArtifactTableRow) {
  const pill = resolveReviewStatusPill({
    status: row.reviewStatus ?? "",
    reviewType: row.reviewType,
  });
  const prominence = pill.color === "brand" ? ("high" as const) : ("default" as const);
  const statusPill = (
    <StatusPill
      label={pill.label}
      color={pill.color}
      appearance="filled"
      prominence={prominence}
      size="sm"
    />
  );

  if (pill.tooltip) {
    return (
      <Tooltip label={pill.tooltip} position="top">
        <span className="inline-flex max-w-full min-w-0">{statusPill}</span>
      </Tooltip>
    );
  }

  return (
    <TruncatedTooltip label={pill.label} inlineFlex maxWidth={320}>
      {statusPill}
    </TruncatedTooltip>
  );
}

function mapReviewTypePill(rt: string | null | undefined): {
  label: string;
  color: StatusPillColor;
} {
  const raw = String(rt ?? "").trim().toLowerCase();
  if (raw === "compare" || raw === "comparison")
    return { label: "Compare", color: "mushroom" };
  if (raw === "approve" || raw === "approval")
    return { label: "Approve", color: "mushroom" };
  if (raw === "align" || raw === "alignment")
    return { label: "Align", color: "mushroom" };
  if (raw === "critique") return { label: "Critique", color: "mushroom" };
  return {
    label: rt ? rt.charAt(0).toUpperCase() + rt.slice(1) : "—",
    color: "mushroom",
  };
}

function isCompareReviewType(rt: string | null | undefined): boolean {
  const raw = String(rt ?? "").trim().toLowerCase();
  return raw === "compare" || raw === "comparison";
}

function toPreviewFileType(
  fileType: string | null,
  linkUrl: string | null
): ArtifactPreviewFileType {
  if (linkUrl) {
    if (linkUrl.toLowerCase().includes("figma.com")) return "figma";
    return "link";
  }
  const f = (fileType ?? "").toLowerCase();
  if (f === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(f))
    return f as ArtifactPreviewFileType;
  return "generic";
}

function VersionArtifactPanel({
  v,
  artifactDisplayName,
}: {
  v: ProjectArtifactHistoryVersion;
  artifactDisplayName: string;
}) {
  const pill = mapReviewTypePill(v.reviewType);
  const ft = toPreviewFileType(v.fileType, v.linkUrl);
  const created = v.versionCreatedAt ? new Date(v.versionCreatedAt) : null;
  const lastEdited =
    created && !Number.isNaN(created.getTime())
      ? `Edited ${formatDistanceToNow(created, { addSuffix: true })}`
      : undefined;

  const details = (
    <>
      <DetailRow
        label="Review title"
        value={
          v.reviewId && v.reviewTitle ? (
            <Link
              href={`/reviews/${v.reviewId}`}
              className="text-[13px] font-normal no-underline hover:underline"
              style={{ color: TEXT_LINK }}
            >
              {v.reviewTitle}
            </Link>
          ) : (
            <span className="text-[13px] font-normal" style={{ color: TEXT_DISABLED }}>
              —
            </span>
          )
        }
      />
      <DetailRow
        label="Review type"
        value={
          <StatusPill
            label={pill.label}
            color={pill.color}
            appearance="outline"
            size="sm"
          />
        }
      />
      <DetailRow
        label="Reviewers"
        value={
          <div className={artifactStyles.avatarGroup}>
            {v.reviewerPeople.length === 0 ? (
              <span className="text-[13px] font-normal" style={{ color: TEXT_DISABLED }}>
                —
              </span>
            ) : (
              v.reviewerPeople.map((p, index) => {
                const isDecisionMaker =
                  isCompareReviewType(v.reviewType) && index === 0;

                if (!isDecisionMaker) {
                  return (
                    <Avatar
                      key={p.id}
                      name={p.name}
                      contributorId={p.id}
                      src={p.avatarUrl ?? undefined}
                      size="md"
                      className={artifactStyles.avatarGroupItem}
                    />
                  );
                }

                return (
                  <span
                    key={p.id}
                    className={artifactStyles.decisionMakerAvatarRing}
                  >
                    <Avatar
                      name={p.name}
                      contributorId={p.id}
                      src={p.avatarUrl ?? undefined}
                      size="md"
                      className={artifactStyles.avatarGroupItem}
                    />
                  </span>
                );
              })
            )}
          </div>
        }
      />
      <DetailRow
        label="Feedback"
        value={
          v.feedbackNa ? (
            <span className="text-[13px] font-normal" style={{ color: TEXT_DISABLED }}>
              n/a
            </span>
          ) : v.reviewId && v.feedbackCount > 0 ? (
            <Link
              href={`/reviews/${v.reviewId}?tab=activity`}
              className="text-[13px] font-normal no-underline hover:underline"
              style={{ color: TEXT_LINK }}
            >
              {v.feedbackCount} comments
            </Link>
          ) : (
            <span className="text-[13px] font-normal" style={{ color: TEXT_DISABLED }}>
              No feedback
            </span>
          )
        }
      />
      <DetailRow
        label="Decision"
        labelAlign="top"
        value={
          v.decisionSummary ? (
            <span
              className="text-[13px] font-normal leading-snug"
              style={{ color: TEXT_PRIMARY }}
            >
              {v.decisionSummary}
            </span>
          ) : (
            <span className="text-[13px] font-normal" style={{ color: TEXT_DISABLED }}>
              No final decision yet
            </span>
          )
        }
      />
    </>
  );

  return (
    <ArtifactPreview
      state="artifact-history"
      className="w-full min-w-0 max-w-full"
      size="large"
      mode="readonly"
      inlineEditable={false}
      showDetails
      fileType={ft}
      fileName={v.fileName?.trim() ?? ""}
      historyVersionNumber={v.versionNumber}
      lastEdited={lastEdited}
      artifactName={artifactDisplayName}
      description={v.description ?? ""}
      imageUrl={v.linkUrl ? undefined : (v.fileUrl ?? undefined)}
      linkUrl={v.linkUrl ?? undefined}
      figmaFileMeta={null}
      iterationOptions={[]}
      artifactHistoryDetails={details}
    />
  );
}

function VersionHistoryAccordion({
  versions,
  artifactDisplayName,
}: {
  versions: ProjectArtifactHistoryVersion[];
  artifactDisplayName: string;
}) {
  const maxVersion = Math.max(...versions.map((x) => x.versionNumber), 0);
  const multi = versions.length >= 2;

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const latest = versions.find((x) => x.versionNumber === maxVersion)?.versionId;
    return latest ? new Set([latest]) : new Set();
  });

  useEffect(() => {
    const latest = versions.find((x) => x.versionNumber === maxVersion)?.versionId;
    setExpanded(latest ? new Set([latest]) : new Set());
  }, [versions, maxVersion]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!multi) {
    const v = versions[0];
    if (!v) return null;
    return (
      <div className="flex min-w-0 w-full flex-col">
        <div
          className="flex h-8 w-full min-w-0 shrink-0 items-center gap-2 px-0"
          style={{ boxSizing: "border-box" }}
        >
          <span
            className="shrink-0 text-[15px] font-normal leading-snug"
            style={{ color: TEXT_SECONDARY }}
          >
            {`Version ${v.versionNumber} — Current`}
          </span>
          <span
            className="min-h-px min-w-0 flex-1 border-t border-solid"
            style={{ borderColor: BORDER }}
            aria-hidden
          />
        </div>
        <div className="w-full min-w-0 pb-4 pt-2">
          <VersionArtifactPanel v={v} artifactDisplayName={artifactDisplayName} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 w-full flex-col">
      {versions.map((v) => {
        const isLatest = v.versionNumber === maxVersion;
        const open = expanded.has(v.versionId);
        return (
          <div key={v.versionId} className="w-full min-w-0">
            <div
              className="flex h-8 w-full min-w-0 shrink-0 items-center gap-2 px-0"
              style={{ boxSizing: "border-box" }}
            >
              <span
                className="shrink-0 text-[15px] font-normal leading-snug"
                style={{ color: TEXT_SECONDARY }}
              >
                {isLatest
                  ? `Version ${v.versionNumber} — Current`
                  : `Version ${v.versionNumber}`}
              </span>
              <span
                className="min-h-px min-w-0 flex-1 border-t border-solid"
                style={{ borderColor: BORDER }}
                aria-hidden
              />
              <IconSquareButton
                variant="ghost"
                icon={open ? "chevron-up" : "chevron-down"}
                label={open ? "Collapse version" : "Expand version"}
                aria-expanded={open}
                onClick={() => toggle(v.versionId)}
              />
            </div>
            {open ? (
              <div className="w-full min-w-0 pb-4 pt-2">
                <VersionArtifactPanel v={v} artifactDisplayName={artifactDisplayName} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function DetailRow({
  label,
  value,
  labelAlign = "center",
}: {
  label: string;
  value: ReactNode;
  labelAlign?: "center" | "top";
}) {
  const rowAlign = labelAlign === "top" ? "items-start" : "items-center";
  const labelAlignClass =
    labelAlign === "top" ? "items-start pt-[2px]" : "items-center";

  return (
    <div className={`flex gap-[10px] ${rowAlign}`}>
      <span
        className={`flex w-[100px] shrink-0 text-[10px] font-semibold uppercase leading-snug ${labelAlignClass}`}
        style={{
          color: TEXT_SECONDARY,
          letterSpacing: "1px",
        }}
      >
        {label}
      </span>
      <div
        className={`flex min-w-0 flex-1 text-[13px] font-normal leading-snug ${
          labelAlign === "top" ? "items-start" : "items-center"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function ArtifactsTab({
  data,
  onNewReview,
}: {
  data: ProjectArtifactsTabPayload;
  onNewReview: () => void;
}) {
  const router = useRouter();
  const { overview, historyByArtifactId } = data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const actionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const artifactRows = useMemo(
    () => overview.map((r) => ({ ...r, id: r.artifactId })),
    [overview]
  );

  const artifactColumns = useMemo(
    (): ColumnDef<ArtifactTableRow>[] => [
      {
        key: "version",
        label: "Version",
        width: 96,
        align: "right",
        cellType: "custom",
        render: (row, { selected }) => (
          <span
            className="tabular-nums"
            style={{
              fontWeight: 500,
              color: selected ? TEXT_HEADING : TEXT_SECONDARY,
            }}
          >
            v{row.versionNumber}
          </span>
        ),
      },
      {
        key: "title",
        label: "Title",
        width: "flex",
        cellType: "text-bold",
        render: (row) => row.artifactName,
      },
      {
        key: "status",
        label: "Status",
        width: 196,
        cellType: "status",
        render: (row) => renderReviewStatusPill(row),
      },
      {
        key: "reviewType",
        label: "Review Type",
        width: 128,
        cellType: "text",
        render: (row) => row.reviewType ?? "—",
      },
      {
        key: "feedback",
        label: "Feedback",
        width: 104,
        align: "center",
        cellType: "custom",
        render: (row) => (
          <span
            style={{
              color:
                row.feedbackNa || row.feedbackCount === 0
                  ? TEXT_DISABLED
                  : TEXT_SECONDARY,
            }}
          >
            {row.feedbackNa || row.feedbackCount === 0
              ? "n/a"
              : row.feedbackCount}
          </span>
        ),
      },
      {
        key: "actions",
        label: "",
        width: 40,
        cellType: "kebab",
        render: (row) => (
          <>
            <IconSquareButton
              variant="ghost"
              ref={(el) => {
                actionRefs.current[row.id] = el;
              }}
              icon="kebab"
              label="Artifact actions"
              aria-expanded={openMenuId === row.id}
              aria-haspopup="menu"
              onClick={() =>
                setOpenMenuId((prev) => (prev === row.id ? null : row.id))
              }
            />
            <Menu
              open={openMenuId === row.id}
              onClose={() => setOpenMenuId(null)}
              type="action-menu"
              anchorRef={{
                current: actionRefs.current[row.id] as HTMLElement | null,
              }}
              align="left"
              portal
              portalZIndex={100}
            >
              <MenuItem
                label="View version history"
                onClick={() => {
                  setSelectedId(row.artifactId);
                  setOpenMenuId(null);
                }}
              />
              <MenuItem
                label="Open review"
                disabled={!row.reviewId}
                onClick={() => {
                  if (row.reviewId) router.push(`/reviews/${row.reviewId}`);
                  setOpenMenuId(null);
                }}
              />
            </Menu>
          </>
        ),
      },
    ],
    [openMenuId, router]
  );

  const selectedHistory = useMemo(() => {
    if (!selectedId) return null;
    return historyByArtifactId[selectedId] ?? null;
  }, [selectedId, historyByArtifactId]);

  const selectedName = useMemo(() => {
    if (!selectedId) return "";
    return overview.find((r) => r.artifactId === selectedId)?.artifactName ?? "";
  }, [selectedId, overview]);

  const drawer =
    typeof document !== "undefined" && selectedId
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="artifact-drawer-title"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              width: "480px",
              maxWidth: "100vw",
              height: "100vh",
              zIndex: 50,
              backgroundColor: "#ffffff",
              borderLeft: `1px solid ${BORDER_SUBTLE}`,
              boxShadow: "-4px 0 16px rgba(41, 33, 28, 0.08)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              className="flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-solid px-6"
              style={{
                height: 56,
                boxSizing: "border-box",
                borderColor: BORDER_SUBTLE,
                backgroundColor: "#ffffff",
              }}
            >
              <h4
                id="artifact-drawer-title"
                className="m-0 min-w-0 flex-1 text-[18px] font-semibold leading-snug"
                style={{ color: TEXT_HEADING }}
              >
                <TruncatedTooltip
                  label={selectedName || "Artifact"}
                  className="block truncate"
                  fullWidth
                  maxWidth={320}
                >
                  {selectedName || "Artifact"}
                </TruncatedTooltip>
              </h4>
              <IconSquareButton
                variant="ghost"
                icon="close"
                label="Close panel"
                onClick={() => setSelectedId(null)}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {selectedHistory && selectedHistory.length > 0 ? (
                <VersionHistoryAccordion
                  versions={selectedHistory}
                  artifactDisplayName={selectedName}
                />
              ) : (
                <p
                  className="m-0 text-center text-[13px] leading-relaxed"
                  style={{ color: TEXT_TERTIARY }}
                >
                  No version history for this artifact.
                </p>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        style={{ flex: "1 1 0%", width: "100%" }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-0">
          <div
            className={`${panelEmptyStateStyles.sectionHeaderZone} flex min-w-0 flex-wrap ${
              overview.length === 0 ? "items-center" : "items-baseline"
            }`}
            style={{ gap: 24 }}
          >
            <h3
              className="m-0 text-[20px] font-bold leading-[1.3] text-[#6b1e2e]"
              style={{ letterSpacing: "-0.3px" }}
            >
              Current Artifacts
            </h3>
            {overview.length > 0 ? (
              <p
                className="m-0 text-[14px] font-normal leading-relaxed"
                style={{ color: TEXT_SECONDARY }}
              >
                The latest version of each artifact in this project.
              </p>
            ) : null}
          </div>

          {overview.length === 0 ? (
            <div
              className={`${panelEmptyStateStyles.root} ${panelEmptyStateStyles.surfaceWhite}`}
            >
              <p className={panelEmptyStateStyles.copy}>
                Artifacts will appear here as you add versioned artifacts to reviews.
              </p>
              <Button
                variant="secondary"
                size="sm"
                label="Review"
                icon="leading"
                iconName="plus"
                onClick={onNewReview}
              />
            </div>
          ) : (
            <Table<ArtifactTableRow>
              className={artifactStyles.artifactsTable}
              columns={artifactColumns}
              rows={artifactRows}
              selectedRowId={selectedId ?? undefined}
              onRowClick={(row) => setSelectedId(row.artifactId)}
            />
          )}
        </div>
      </div>
      {drawer}
    </>
  );
}
