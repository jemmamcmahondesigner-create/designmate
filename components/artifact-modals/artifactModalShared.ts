import {
  formatVersionLabel,
  getMajorVersion,
  getNextSiblingVersion,
} from "@/lib/artifacts/versioning";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ArtifactModalInitialValues = {
  localKey?: string;
  canonicalArtifactId?: string | null;
  relatedArtifactId?: string | null;
  title?: string;
  linkUrl?: string;
  versionNumber?: string;
  description?: string;
  file?: File | null;
  fileUrl?: string | null;
  originalFileName?: string | null;
  baseType?: "Figma" | "PDF" | "Image";
};

export type RelatedSourceVersionUpdate = {
  versionRowId: string;
  versionNumber: string;
  /** Review that owns the version row being updated (write-back only when same review). */
  sourceReviewId: string | null;
};

export type ResolvedRelatedArtifactFields = {
  title: string;
  versionNumber: string;
  description: string;
  relatedSourceVersionUpdate: RelatedSourceVersionUpdate | null;
};

/** Dropdown apply payload — new artifact or selected version row ids. */
export type RelatedArtifactSelection =
  | { type: "new" }
  | { type: "versions"; versionIds: string[] };

export const DEFAULT_RELATED_ARTIFACT_SELECTION: RelatedArtifactSelection = {
  type: "new",
};

export type ArtifactModalSavePayload = {
  localKey: string;
  canonicalArtifactId: string | null;
  kind: "link" | "file";
  title: string;
  /** Name captured at save for `artifact_versions.label` (user-entered title). */
  versionRowLabel: string;
  iterationLabel: string;
  versionNumber: string;
  description: string;
  linkUrl: string;
  file: File | null;
  fileUrl: string | null;
  originalFileName: string | null;
  baseType: "Figma" | "PDF" | "Image";
  /** When linking to an existing artifact, bump its latest version on save. */
  relatedSourceVersionUpdate?: RelatedSourceVersionUpdate | null;
};

export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
].join(",");

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isFigmaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.figma.com" || parsed.hostname === "figma.com";
  } catch {
    return false;
  }
}

export function buildFigmaEmbedUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return url;
  if (/figma\.com\/embed/i.test(trimmed)) return trimmed;
  if (!isFigmaUrl(trimmed)) return url;
  return `https://www.figma.com/embed?embed_host=designtrace&url=${encodeURIComponent(trimmed)}`;
}

const FIGMA_OEMBED_TITLE_SEP = " \u00b7 ";

export function parseFigmaFrameNameFromOembedTitle(oembedTitle: string): string {
  const trimmed = oembedTitle.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(FIGMA_OEMBED_TITLE_SEP);
  if (parts.length < 2) return trimmed;
  return (parts[parts.length - 1] ?? "").trim() || trimmed;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function resolveBaseTypeFromFile(
  file: File | null,
  originalFileName: string | null,
  fallback: "Figma" | "PDF" | "Image" = "Image",
): "Figma" | "PDF" | "Image" {
  const fileName = file?.name ?? originalFileName ?? "";
  if (file?.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    return "PDF";
  }
  return fallback;
}

export function resolveBaseTypeFromLink(linkUrl: string): "Figma" | "PDF" | "Image" {
  return linkUrl.toLowerCase().includes("figma.com") ? "Figma" : "Image";
}

/** Explicit “new artifact” option — not a DB id. */
export const RELATED_NEW = "__related_new__" as const;

export type RelatedArtifactVersionRow = {
  id: string;
  label: string;
  version_number: string;
  description: string | null;
  created_at: string;
  review_id: string | null;
};

export type ProjectArtifactForRelatedSelect = {
  id: string;
  name: string;
  description: string | null;
  versions: RelatedArtifactVersionRow[];
};

export type RelatedArtifactVersionSelectOption = {
  value: string;
  label: string;
  artifactId: string;
  versionNumber: string;
  reviewId: string | null;
  description: string | null;
  versionLabel: string;
  versionRowId: string;
  createdAt: string;
};

export type RelatedArtifactSelectStructure = {
  newArtifact: { value: typeof RELATED_NEW; label: string };
  groups: Array<{
    groupLabel: string;
    options: RelatedArtifactVersionSelectOption[];
  }>;
};

export function pickLatestArtifactVersionRow(
  rows: RelatedArtifactVersionRow[],
): RelatedArtifactVersionRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(left.created_at);
    const rightTime = Date.parse(right.created_at);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return right.id.localeCompare(left.id);
  })[0];
}

function sortVersionsAscending(rows: RelatedArtifactVersionRow[]): RelatedArtifactVersionRow[] {
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(left.created_at);
    const rightTime = Date.parse(right.created_at);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.id.localeCompare(right.id);
  });
}

export function buildRelatedArtifactSelectOptions(
  artifacts: ProjectArtifactForRelatedSelect[],
): RelatedArtifactSelectStructure {
  return {
    newArtifact: { value: RELATED_NEW, label: "New artifact" },
    groups: artifacts.map((artifact) => {
      const versions = sortVersionsAscending(artifact.versions);
      const groupLabel = versions[0]?.label.trim() || artifact.name;
      return {
        groupLabel,
        options: versions.map((version) => {
          const versionLabel = version.label.trim() || artifact.name;
          return {
            value: version.id,
            label: `${versionLabel} · ${formatVersionLabel(version.version_number)}`,
            artifactId: artifact.id,
            versionNumber: version.version_number,
            reviewId: version.review_id,
            description: version.description,
            versionLabel,
            versionRowId: version.id,
            createdAt: version.created_at,
          };
        }),
      };
    }),
  };
}

export function findRelatedVersionSelectOption(
  structure: RelatedArtifactSelectStructure,
  versionRowId: string,
): RelatedArtifactVersionSelectOption | null {
  const id = versionRowId.trim();
  if (!id) return null;
  for (const group of structure.groups) {
    const match = group.options.find((option) => option.value === id);
    if (match) return match;
  }
  return null;
}

export function findRelatedVersionSelectOptions(
  structure: RelatedArtifactSelectStructure,
  versionRowIds: string[],
): RelatedArtifactVersionSelectOption[] {
  const ids = new Set(versionRowIds.map((id) => id.trim()).filter(Boolean));
  if (ids.size === 0) return [];
  const results: RelatedArtifactVersionSelectOption[] = [];
  for (const group of structure.groups) {
    for (const option of group.options) {
      if (ids.has(option.value)) results.push(option);
    }
  }
  return results;
}

export function pickLatestRelatedVersionOption(
  options: RelatedArtifactVersionSelectOption[],
): RelatedArtifactVersionSelectOption | null {
  if (options.length === 0) return null;
  return [...options].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return right.value.localeCompare(left.value);
  })[0];
}

export function resolveRelatedArtifactDropdownLabel(
  selection: RelatedArtifactSelection,
  structure: RelatedArtifactSelectStructure,
): string {
  if (selection.type === "new") {
    return structure.newArtifact.label;
  }
  const count = selection.versionIds.length;
  if (count === 0) {
    return structure.newArtifact.label;
  }
  if (count === 1) {
    const match = findRelatedVersionSelectOption(structure, selection.versionIds[0] ?? "");
    if (!match) return structure.newArtifact.label;
    return `${match.versionLabel} · ${formatVersionLabel(match.versionNumber)}`;
  }
  return `${count} artifacts selected`;
}

export function relatedArtifactIdToDropdownSelection(
  relatedArtifactId: string | null | undefined,
): RelatedArtifactSelection {
  const id = String(relatedArtifactId ?? "").trim();
  if (!id || id === RELATED_NEW) {
    return DEFAULT_RELATED_ARTIFACT_SELECTION;
  }
  return { type: "versions", versionIds: [id] };
}

/** Artifacts with at least one artifact_versions row (ghost rows excluded). */
export async function fetchProjectArtifactsForRelatedSelect(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectArtifactForRelatedSelect[]> {
  const { data, error } = await supabase
    .from("artifacts")
    .select(
      "id, name, description, artifact_versions!inner(id, label, version_number, description, created_at, review_id)",
    )
    .eq("project_id", projectId.trim())
    .order("name", { ascending: true })
    .order("created_at", { ascending: true, foreignTable: "artifact_versions" });

  if (error || !Array.isArray(data)) return [];

  const results: ProjectArtifactForRelatedSelect[] = [];
  for (const row of data) {
    const record = row as Record<string, unknown>;
    const id = String(record.id ?? "").trim();
    const name = String(record.name ?? "").trim();
    if (!id || !name) continue;

    const versionRows = Array.isArray(record.artifact_versions)
      ? sortVersionsAscending(
          (record.artifact_versions as Record<string, unknown>[]).map((versionRow) => ({
            id: String(versionRow.id ?? "").trim(),
            label: String(versionRow.label ?? "").trim() || name,
            version_number: String(versionRow.version_number ?? "v1"),
            description:
              versionRow.description == null ? null : String(versionRow.description),
            created_at: String(versionRow.created_at ?? ""),
            review_id:
              versionRow.review_id == null
                ? null
                : String(versionRow.review_id).trim() || null,
          })),
        )
      : [];

    if (versionRows.length === 0) continue;

    results.push({
      id,
      name,
      description:
        record.description == null ? null : String(record.description).trim() || null,
      versions: versionRows,
    });
  }

  return results;
}

/*
 * STEP 0 — Related artifact versioning:
 * - resolveRelatedArtifactSelection: same-review → sub-version via getNextSiblingVersion
 *   + optional write-back; cross-review / null reviewId → major increment only, no write-back.
 * - applyRelatedSourceVersionUpdate: guarded write-back — only when sourceReviewId matches
 *   currentReviewId (never mutates completed/other reviews).
 * - fetchProjectArtifactsForRelatedSelect: all version rows per artifact, sorted by created_at ASC.
 */
export function resolveRelatedArtifactSelection(
  selected:
    | RelatedArtifactVersionSelectOption
    | RelatedArtifactVersionSelectOption[],
  currentReviewId: string | null,
): ResolvedRelatedArtifactFields {
  const selectedOptions = Array.isArray(selected) ? selected : [selected];
  // TODO: Full multi-version resolution — version fields use the latest row only for now.
  const reference =
    pickLatestRelatedVersionOption(selectedOptions) ?? selectedOptions[0];
  if (!reference) {
    return {
      title: "",
      versionNumber: "v1",
      description: "",
      relatedSourceVersionUpdate: null,
    };
  }

  const existingVersion = formatVersionLabel(reference.versionNumber);
  const description = reference.description?.trim() || "";

  const isSameReview =
    currentReviewId != null &&
    reference.reviewId != null &&
    reference.reviewId === currentReviewId;

  if (isSameReview) {
    const { updatedSourceVersion, newSiblingVersion } =
      getNextSiblingVersion(existingVersion);
    return {
      title: reference.versionLabel,
      versionNumber: newSiblingVersion,
      description,
      relatedSourceVersionUpdate: {
        versionRowId: reference.versionRowId,
        versionNumber: updatedSourceVersion,
        sourceReviewId: currentReviewId,
      },
    };
  }

  const nextMajor = getMajorVersion(existingVersion) + 1;
  return {
    title: reference.versionLabel,
    versionNumber: `v${nextMajor}`,
    description,
    relatedSourceVersionUpdate: null,
  };
}

export async function applyRelatedSourceVersionUpdate(
  supabase: SupabaseClient,
  update: RelatedSourceVersionUpdate | null | undefined,
  currentReviewId: string | null,
): Promise<void> {
  if (!update?.versionRowId?.trim() || !update.versionNumber?.trim()) return;
  if (!currentReviewId || update.sourceReviewId !== currentReviewId) return;

  const { error } = await supabase
    .from("artifact_versions")
    .update({ version_number: update.versionNumber })
    .eq("id", update.versionRowId.trim());
  if (error) {
    console.error(
      "[artifact-modal] Failed to update related artifact version:",
      error.message,
    );
  }
}
