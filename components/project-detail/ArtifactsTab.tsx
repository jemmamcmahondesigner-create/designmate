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
  type ColumnDef,
  type StatusPillColor,
} from "@/components/ui/ds";
import { formatDistanceToNow } from "@/lib/formatDistanceToNow";
import { compareVersions, formatVersionLabel } from "@/lib/artifacts/versioning";
import { resolveArtifactPreviewFileType } from "@/lib/artifacts/resolveArtifactPreviewFileType";
import { resolveReviewStatusPill } from "@/lib/reviews/reviewStatusDisplay";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

type ArtifactDataRow = ProjectArtifactOverviewRow & {
  id: string;
  type: "artifact";
  versionRowTitle: string;
};
type ArtifactsTableRow =
  | { id: string; type: "section"; title: string }
  | ArtifactDataRow;

const ARTIFACTS_TABLE_SCOPE = "artifacts-tab-table";

const ARTIFACTS_TABLE_SECTION_ROW_STYLES = `
.${ARTIFACTS_TABLE_SCOPE} tbody tr:has([data-artifact-section-heading]) {
  position: relative;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
}
.${ARTIFACTS_TABLE_SCOPE} tbody tr:has([data-artifact-section-heading]) td {
  overflow: visible !important;
  max-width: none !important;
}
.${ARTIFACTS_TABLE_SCOPE} tbody tr:has([data-artifact-section-heading]) [data-artifact-section-heading] {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  overflow: visible;
  white-space: normal;
  z-index: 1;
}
`;

const SECTION_HEADING_COLOR = "var(--text-heading, #6b1e2e)";

function isArtifactRow(row: ArtifactsTableRow): row is ArtifactDataRow {
  return row.type === "artifact";
}

function renderArtifactSectionHeading(row: Extract<ArtifactsTableRow, { type: "section" }>) {
  return (
    <div
      data-artifact-section-heading
      style={{ display: "flex", alignItems: "center", gap: 6, overflow: "visible" }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: SECTION_HEADING_COLOR,
          overflow: "visible",
          whiteSpace: "normal",
        }}
      >
        {row.title}
      </span>
    </div>
  );
}

function renderReviewStatusPill(row: ArtifactDataRow) {
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

function historyReviewTypeKey(
  rt: string | null | undefined,
): "compare" | "approve" | "align" | "critique" | null {
  const raw = String(rt ?? "").trim().toLowerCase();
  if (raw === "compare" || raw === "comparison") return "compare";
  if (raw === "approve" || raw === "approval") return "approve";
  if (raw === "align" || raw === "alignment") return "align";
  if (raw === "critique") return "critique";
  return null;
}

function approveArtifactStatusPill(
  reviewStatus: string | null | undefined,
): { label: string; color: StatusPillColor } | null {
  const status = String(reviewStatus ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (status === "approved" || status === "complete") {
    return { label: "Approved", color: "green" };
  }
  if (status === "needs-changes" || status === "changes-needed") {
    return { label: "Needs Changes", color: "brand" };
  }
  return null;
}

function versionLabelFor(
  versionId: string,
  versionLabelsByVersionId: Record<string, string>,
  fallback: string
): string {
  return versionLabelsByVersionId[versionId]?.trim() || fallback;
}

function VersionArtifactPanel({
  v,
  versionLabel,
}: {
  v: ProjectArtifactHistoryVersion;
  versionLabel: string;
}) {
  const pill = mapReviewTypePill(v.reviewType);
  const typeKey = historyReviewTypeKey(v.reviewType);
  const approveStatus = approveArtifactStatusPill(v.reviewStatus);
  const previewFileType = resolveArtifactPreviewFileType({
    linkUrl: v.linkUrl,
    originalFileName: v.fileName,
    type:
      v.linkUrl && v.linkUrl.toLowerCase().includes("figma.com")
        ? "Figma"
        : v.fileType?.toLowerCase() === "pdf"
          ? "PDF"
          : undefined,
  });
  const created = v.versionCreatedAt ? new Date(v.versionCreatedAt) : null;
  const lastEdited =
    created && !Number.isNaN(created.getTime())
      ? `Edited ${formatDistanceToNow(created, { addSuffix: true })}`
      : undefined;

  const showFeedbackRow =
    (typeKey === "approve" || typeKey === "compare") && v.feedbackCount > 0;
  const showDecisionRow =
    typeKey === "compare" && Boolean(v.decisionSummary?.trim());
  const showArtifactStatusRow = typeKey === "approve" && approveStatus != null;

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
      {showFeedbackRow ? (
        <DetailRow
          label="Feedback"
          value={
            v.reviewId ? (
              <Link
                href={`/reviews/${v.reviewId}?tab=activity`}
                className="text-[13px] font-normal no-underline hover:underline"
                style={{ color: TEXT_LINK }}
              >
                {v.feedbackCount} comments
              </Link>
            ) : (
              <span
                className="text-[13px] font-normal"
                style={{ color: TEXT_SECONDARY }}
              >
                {v.feedbackCount} comments
              </span>
            )
          }
        />
      ) : null}
      {showArtifactStatusRow && approveStatus ? (
        <DetailRow
          label="Artifact Status"
          value={
            <StatusPill
              label={approveStatus.label}
              color={approveStatus.color}
              appearance="filled"
              prominence="high"
              size="sm"
            />
          }
        />
      ) : null}
      {showDecisionRow ? (
        <DetailRow
          label="Decision"
          labelAlign="top"
          value={
            <span
              className="text-[13px] font-normal leading-snug"
              style={{ color: TEXT_PRIMARY }}
            >
              {v.decisionSummary}
            </span>
          }
        />
      ) : null}
    </>
  );

  return (
    <ArtifactPreview
      state="artifact-history"
      className="w-full min-w-0 max-w-full"
      size="large"
      mode="readonly"
      inlineEditable={false}
      enableOpenInteraction
      showDetails
      fileType={previewFileType}
      fileName={versionLabel}
      historyVersionNumber={undefined}
      iteration={formatVersionLabel(v.versionNumber)}
      lastEdited={lastEdited}
      artifactName={versionLabel}
      description={v.description ?? ""}
      imageUrl={v.fileUrl ?? undefined}
      linkUrl={v.linkUrl ?? undefined}
      snapshotUrl={v.snapshot_url ?? null}
      snapshotCapturedAt={v.snapshot_captured_at ?? null}
      mediaViewMode={v.snapshot_url ? "snapshot" : "live"}
      figmaFileMeta={null}
      iterationOptions={[]}
      artifactHistoryDetails={details}
    />
  );
}

function VersionHistoryAccordion({
  versions,
  artifactDisplayName,
  selectedVersionId,
  versionLabelsByVersionId,
}: {
  versions: ProjectArtifactHistoryVersion[];
  artifactDisplayName: string;
  selectedVersionId: string | null;
  versionLabelsByVersionId: Record<string, string>;
}) {
  const latestVersion = versions.reduce<string | null>((best, current) => {
    if (!best) return current.versionNumber;
    return compareVersions(current.versionNumber, best) > 0
      ? current.versionNumber
      : best;
  }, null);
  const multi = versions.length >= 2;

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (selectedVersionId) return new Set([selectedVersionId]);
    const latest = versions.find((x) => x.versionNumber === latestVersion)?.versionId;
    return latest ? new Set([latest]) : new Set();
  });

  useEffect(() => {
    if (selectedVersionId) {
      setExpanded(new Set([selectedVersionId]));
      return;
    }
    const latest = versions.find((x) => x.versionNumber === latestVersion)?.versionId;
    setExpanded(latest ? new Set([latest]) : new Set());
  }, [versions, latestVersion, selectedVersionId]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderVersionHeading = (
    v: ProjectArtifactHistoryVersion,
    isLatest: boolean,
    isOpen: boolean,
  ) => {
    const label = versionLabelFor(v.versionId, versionLabelsByVersionId, artifactDisplayName);
    const versionTag = formatVersionLabel(v.versionNumber);
    return (
      <>
        <span
          className="shrink-0 text-[12px] font-bold leading-snug"
          style={{ color: isOpen ? TEXT_HEADING : TEXT_SECONDARY }}
        >
          {label}
        </span>
        <span
          className="shrink-0 text-[12px] font-normal tabular-nums leading-snug"
          style={{ color: TEXT_TERTIARY }}
        >
          {` · ${versionTag}${isLatest ? " — Current" : ""}`}
        </span>
      </>
    );
  };

  if (!multi) {
    const v = versions[0];
    if (!v) return null;
    return (
      <div className="flex min-w-0 w-full flex-col">
        <div
          className="flex h-8 w-full min-w-0 shrink-0 items-center gap-2 px-0"
          style={{ boxSizing: "border-box" }}
        >
          <span className="flex min-w-0 items-center gap-1 text-[12px] leading-snug">
            {renderVersionHeading(v, true, true)}
          </span>
          <span
            className="min-h-px min-w-0 flex-1 border-t border-solid"
            style={{ borderColor: BORDER }}
            aria-hidden
          />
        </div>
        <div className="w-full min-w-0 pb-4 pt-2">
          <VersionArtifactPanel
            v={v}
            versionLabel={versionLabelFor(v.versionId, versionLabelsByVersionId, artifactDisplayName)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 w-full flex-col">
      {versions.map((v) => {
        const isLatest = v.versionNumber === latestVersion;
        const open = expanded.has(v.versionId);
        return (
          <div key={v.versionId} className="w-full min-w-0">
            <div
              className="flex h-8 w-full min-w-0 shrink-0 items-center gap-2 px-0"
              style={{ boxSizing: "border-box" }}
            >
              <span className="flex min-w-0 items-center gap-1 text-[12px] leading-snug">
                {renderVersionHeading(v, isLatest, open)}
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
                <VersionArtifactPanel
                  v={v}
                  versionLabel={versionLabelFor(
                    v.versionId,
                    versionLabelsByVersionId,
                    artifactDisplayName
                  )}
                />
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
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [versionLabelsByVersionId, setVersionLabelsByVersionId] = useState<
    Record<string, string>
  >({});
  const actionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    const versionIds = [
      ...new Set([
        ...overview.map((row) => row.versionId),
        ...Object.values(historyByArtifactId).flatMap((versions) =>
          versions.map((version) => version.versionId)
        ),
      ]),
    ].filter(Boolean);
    if (versionIds.length === 0) {
      setVersionLabelsByVersionId({});
      return;
    }

    const supabase = createSupabaseBrowserClient();
    void supabase
      .from("artifact_versions")
      .select("id, label")
      .in("id", versionIds)
      .then(({ data }) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const row of data ?? []) {
          const record = row as { id?: string; label?: string | null };
          const id = String(record.id ?? "").trim();
          const label = String(record.label ?? "").trim();
          if (id && label) next[id] = label;
        }
        setVersionLabelsByVersionId(next);
      });

    return () => {
      cancelled = true;
    };
  }, [overview, historyByArtifactId]);

  const tableRows = useMemo((): ArtifactsTableRow[] => {
    const byArtifact = new Map<string, ArtifactDataRow[]>();

    for (const row of overview) {
      const versionRowTitle =
        versionLabelsByVersionId[row.versionId]?.trim() || row.artifactName;
      const dataRow: ArtifactDataRow = {
        ...row,
        id: row.versionId,
        type: "artifact",
        versionRowTitle,
      };
      const list = byArtifact.get(row.artifactId) ?? [];
      list.push(dataRow);
      byArtifact.set(row.artifactId, list);
    }

    const groups = [...byArtifact.entries()].map(([artifactId, rows]) => {
      const sorted = [...rows].sort((a, b) =>
        compareVersions(a.versionNumber, b.versionNumber)
      );
      const earliestVersion = sorted[0]?.versionNumber ?? "v1";
      const groupLabel = sorted[0]?.versionRowTitle ?? "Untitled artifact";
      return { artifactId, groupLabel, earliestVersion, rows: sorted };
    });

    groups.sort((a, b) => compareVersions(a.earliestVersion, b.earliestVersion));

    const out: ArtifactsTableRow[] = [];
    for (const group of groups) {
      out.push({
        id: `section-${group.artifactId}`,
        type: "section",
        title: group.groupLabel,
      });
      for (const row of group.rows) {
        out.push(row);
      }
    }
    return out;
  }, [overview, versionLabelsByVersionId]);

  const artifactColumns = useMemo(
    (): ColumnDef<ArtifactsTableRow>[] => [
      {
        key: "version",
        label: "Version",
        width: 72,
        align: "right",
        cellType: "custom",
        render: (row, { selected }) => {
          if (row.type === "section") {
            return renderArtifactSectionHeading(row);
          }
          return (
            <span
              className="tabular-nums"
              style={{
                fontWeight: 500,
                color: selected ? TEXT_HEADING : TEXT_SECONDARY,
              }}
            >
              {formatVersionLabel(row.versionNumber)}
            </span>
          );
        },
      },
      {
        key: "title",
        label: "Title",
        width: "flex",
        cellType: "custom",
        render: (row, { selected }) =>
          isArtifactRow(row) ? (
            <span
              className={artifactStyles.titleCell}
              style={{
                color: selected ? TEXT_LINK : TEXT_PRIMARY,
              }}
            >
              {row.versionRowTitle}
            </span>
          ) : null,
      },
      {
        key: "status",
        label: "Status",
        width: "hug",
        minWidth: 120,
        cellType: "status",
        render: (row) => (isArtifactRow(row) ? renderReviewStatusPill(row) : null),
      },
      {
        key: "reviewType",
        label: "Review Type",
        width: 128,
        cellType: "text",
        render: (row) => (isArtifactRow(row) ? row.reviewType ?? "—" : null),
      },
      {
        key: "feedback",
        label: "Feedback",
        width: 104,
        align: "center",
        cellType: "custom",
        render: (row) =>
          isArtifactRow(row) ? (
            <span
              style={{
                color:
                  row.feedbackCount === 0 ? TEXT_DISABLED : TEXT_SECONDARY,
              }}
            >
              {row.feedbackCount === 0 ? "n/a" : row.feedbackCount}
            </span>
          ) : null,
      },
      {
        key: "actions",
        label: "",
        width: 40,
        cellType: "kebab",
        render: (row) =>
          isArtifactRow(row) ? (
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
                    setSelectedArtifactId(row.artifactId);
                    setSelectedVersionId(row.versionId);
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
          ) : null,
      },
    ],
    [openMenuId, router]
  );

  const selectedHistory = useMemo(() => {
    if (!selectedArtifactId) return null;
    return historyByArtifactId[selectedArtifactId] ?? null;
  }, [selectedArtifactId, historyByArtifactId]);

  const selectedName = useMemo(() => {
    if (!selectedArtifactId) return "";
    return overview.find((r) => r.artifactId === selectedArtifactId)?.artifactName ?? "";
  }, [selectedArtifactId, overview]);

  const drawer =
    typeof document !== "undefined" && selectedArtifactId
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
                onClick={() => {
                  setSelectedArtifactId(null);
                  setSelectedVersionId(null);
                }}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {selectedHistory && selectedHistory.length > 0 ? (
                <VersionHistoryAccordion
                  versions={selectedHistory}
                  artifactDisplayName={selectedName}
                  selectedVersionId={selectedVersionId}
                  versionLabelsByVersionId={versionLabelsByVersionId}
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
              Artifacts
            </h3>
            {overview.length > 0 ? (
              <p
                className="m-0 text-[14px] font-normal leading-relaxed"
                style={{ color: TEXT_SECONDARY }}
              >
                The version history of each artifact on this project.
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
            <>
              <style>{ARTIFACTS_TABLE_SECTION_ROW_STYLES}</style>
              <Table<ArtifactsTableRow>
                className={`${artifactStyles.artifactsTable} ${ARTIFACTS_TABLE_SCOPE}`}
                columns={artifactColumns}
                rows={tableRows}
                selectedRowId={selectedVersionId ?? undefined}
                rowClassName={(row) =>
                  row.type === "section" ? artifactStyles.sectionRow : undefined
                }
                onRowClick={(row) => {
                  if (!isArtifactRow(row)) return;
                  if (
                    selectedVersionId === row.versionId &&
                    selectedArtifactId === row.artifactId
                  ) {
                    setSelectedArtifactId(null);
                    setSelectedVersionId(null);
                    return;
                  }
                  setSelectedArtifactId(row.artifactId);
                  setSelectedVersionId(row.versionId);
                }}
              />
            </>
          )}
        </div>
      </div>
      {drawer}
    </>
  );
}
