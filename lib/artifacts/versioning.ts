/**
 * Files that read/write `artifact_versions.version_number`:
 * - components/CreateReviewDrawer.tsx
 * - lib/reviews/submitReviewClient.ts
 * - app/reviews/[reviewId]/page.tsx
 * - app/reviews/[reviewId]/EditReviewDrawer.tsx
 * - lib/projects/loadProjectArtifactsTab.ts
 * - components/project-detail/ArtifactsTab.tsx
 * - components/UploadModal.tsx
 * - components/AddLinkModal.tsx
 * - components/artifact-modals/artifactModalShared.ts
 * - app/actions/generateReviewTitle.ts
 */

type ParsedVersion = {
  major: number;
  minor: number;
};

function parseVersionParts(version: string): ParsedVersion {
  const trimmed = version.trim();
  const withoutPrefix = trimmed.toLowerCase().startsWith("v")
    ? trimmed.slice(1)
    : trimmed;
  const [majorPart, minorPart] = withoutPrefix.split(".");
  const major = Number.parseInt(majorPart ?? "", 10);
  const minor =
    minorPart == null || minorPart === ""
      ? 0
      : Number.parseInt(minorPart, 10);

  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
  };
}

function withVersionPrefix(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return "v1";
  return trimmed.toLowerCase().startsWith("v") ? trimmed : `v${trimmed}`;
}

/** Collapse to at most one sub-version level (v2.1.1 → v2.1). */
function normalizeToSingleSubVersion(version: string): string {
  const normalized = withVersionPrefix(version);
  const withoutPrefix = normalized.slice(1);
  const parts = withoutPrefix.split(".");
  const major = Number.parseInt(parts[0] ?? "", 10);
  if (!Number.isFinite(major) || major < 1) return "v1";
  if (parts.length <= 1) return `v${major}`;
  const minor = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(minor) || minor < 1) return `v${major}`;
  return `v${major}.${minor}`;
}

/**
 * Given an existing version string (e.g. "v2", "v2.1", "v2.3"),
 * return the next sibling version in that round.
 * Sub-versioning is capped at one level (v2.1, v2.2 — never v2.1.1).
 */
export function getNextSiblingVersion(existingVersion: string): {
  updatedSourceVersion: string;
  newSiblingVersion: string;
} {
  const normalized = normalizeToSingleSubVersion(existingVersion);
  const { major, minor } = parseVersionParts(normalized);
  const hasExplicitMinor = /\.\d+/.test(normalized);

  if (!hasExplicitMinor) {
    return {
      updatedSourceVersion: `v${major}.1`,
      newSiblingVersion: `v${major}.2`,
    };
  }

  return {
    updatedSourceVersion: normalized,
    newSiblingVersion: `v${major}.${minor + 1}`,
  };
}

/** "v2" → 2, "v2.1" → 2, "v2.3" → 2 */
export function getMajorVersion(version: string): number {
  return parseVersionParts(withVersionPrefix(version)).major;
}

/** Display-safe version label — returns the string as-is (normalized trim). */
export function formatVersionLabel(version: string): string {
  return withVersionPrefix(version);
}

/** Sort/compare version strings (v2 < v2.1 < v2.2 < v3). */
export function compareVersions(a: string, b: string): number {
  const left = parseVersionParts(withVersionPrefix(a));
  const right = parseVersionParts(withVersionPrefix(b));
  if (left.major !== right.major) return left.major - right.major;
  return left.minor - right.minor;
}

export function isValidVersionString(version: string): boolean {
  return /^v\d+(\.\d+)?$/i.test(version.trim());
}
