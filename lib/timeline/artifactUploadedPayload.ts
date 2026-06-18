import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatVersionLabel,
  getMajorVersion,
} from "@/lib/artifacts/versioning";
import type { TimelineEventRow } from "@/lib/timeline/events";

export type ArtifactUploadedItem = {
  name: string;
  version: string;
};

export type RelatedArtifactRef = {
  id: string;
  name: string;
  version: string;
};

type VersionRow = {
  id: string;
  version_number: string;
  review_id: string | null;
  created_at: string;
  artifact_id: string;
  artifact_name: string;
};

function hasExplicitSubVersion(version: string): boolean {
  return /\.\d+/.test(formatVersionLabel(version));
}

export function hasEnrichedArtifactUploadedPayload(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  if (!payload) return false;
  const artifacts = payload.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) return false;
  return artifacts.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const row = entry as Record<string, unknown>;
    return (
      typeof row.name === "string" &&
      row.name.trim().length > 0 &&
      typeof row.version === "string" &&
      row.version.trim().length > 0
    );
  });
}

export function buildMajorVersionLabel(versions: string[]): string {
  if (versions.length === 0) return "v1";
  const maxMajor = Math.max(...versions.map((v) => getMajorVersion(v)));
  return `v${maxMajor}`;
}

export function buildArtifactUploadedPayloadFields(input: {
  items: ArtifactUploadedItem[];
  relatedArtifact?: RelatedArtifactRef | null;
}): Record<string, unknown> {
  const artifacts = input.items.map((item) => ({
    name: item.name.trim(),
    version: formatVersionLabel(item.version),
  }));
  const major_version_label = buildMajorVersionLabel(
    artifacts.map((item) => item.version),
  );
  const primaryVersion = artifacts[0]?.version ?? "v1";
  const payload: Record<string, unknown> = {
    major_version_label,
    artifacts,
    iteration_label: primaryVersion,
    artifact_names: artifacts.map((item) => item.name),
  };
  if (input.relatedArtifact?.id && input.relatedArtifact.name.trim()) {
    payload.related_artifact = {
      id: input.relatedArtifact.id,
      name: input.relatedArtifact.name.trim(),
      version: formatVersionLabel(input.relatedArtifact.version),
    };
  }
  return payload;
}

function resolveRelatedArtifact(
  matched: VersionRow[],
  currentReviewId: string,
  allVersions: VersionRow[],
): RelatedArtifactRef | undefined {
  if (matched.length === 0) return undefined;
  if (matched.some((row) => hasExplicitSubVersion(row.version_number))) {
    return undefined;
  }

  for (const row of matched) {
    const prior = allVersions
      .filter(
        (version) =>
          version.artifact_id === row.artifact_id &&
          version.review_id != null &&
          version.review_id !== currentReviewId,
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];
    if (!prior) continue;
    return {
      id: row.artifact_id,
      name: row.artifact_name,
      version: formatVersionLabel(prior.version_number),
    };
  }
  return undefined;
}

function mapVersionRows(data: unknown): VersionRow[] {
  if (!Array.isArray(data)) return [];
  const rows: VersionRow[] = [];
  for (const raw of data) {
    const record = raw as Record<string, unknown>;
    const artifactId = String(record.artifact_id ?? "").trim();
    if (!artifactId) continue;
    const artifacts = record.artifacts as Record<string, unknown> | null;
    const artifactName = String(artifacts?.name ?? "").trim() || "Artifact";
    rows.push({
      id: String(record.id ?? "").trim(),
      version_number: String(record.version_number ?? "v1"),
      review_id:
        record.review_id == null
          ? null
          : String(record.review_id).trim() || null,
      created_at: String(record.created_at ?? ""),
      artifact_id: artifactId,
      artifact_name: artifactName,
    });
  }
  return rows;
}

function enrichSingleEvent(
  event: TimelineEventRow,
  versionsByReview: Map<string, VersionRow[]>,
  allVersions: VersionRow[],
): TimelineEventRow {
  if (event.event_type !== "artifact_uploaded") return event;
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (hasEnrichedArtifactUploadedPayload(payload)) return event;

  const reviewId = String(event.review_id ?? "").trim();
  if (!reviewId) return event;

  const names = Array.isArray(payload.artifact_names)
    ? payload.artifact_names
        .map((name) => String(name ?? "").trim())
        .filter(Boolean)
    : [];
  if (names.length === 0) return event;

  const reviewVersions = versionsByReview.get(reviewId) ?? [];
  const nameSet = new Set(names);
  const matched = reviewVersions.filter((row) => nameSet.has(row.artifact_name));

  const iterationLabel = formatVersionLabel(
    String(payload.iteration_label ?? "v1"),
  );
  const resolved =
    matched.length > 0
      ? matched
      : names.length === 1
        ? reviewVersions.filter(
            (row) =>
              formatVersionLabel(row.version_number) === iterationLabel,
          )
        : reviewVersions.filter((row) => nameSet.has(row.artifact_name));

  const items: ArtifactUploadedItem[] =
    resolved.length > 0
      ? resolved.map((row) => ({
          name: row.artifact_name,
          version: formatVersionLabel(row.version_number),
        }))
      : names.map((name) => ({
          name,
          version: iterationLabel,
        }));

  const relatedArtifact = resolveRelatedArtifact(resolved, reviewId, allVersions);
  const enrichedPayload = {
    ...payload,
    ...buildArtifactUploadedPayloadFields({
      items,
      relatedArtifact,
    }),
  };

  return { ...event, payload: enrichedPayload };
}

export async function enrichArtifactUploadedTimelineEvents(
  supabase: SupabaseClient,
  events: TimelineEventRow[],
): Promise<TimelineEventRow[]> {
  const needsEnrich = events.some(
    (event) =>
      event.event_type === "artifact_uploaded" &&
      !hasEnrichedArtifactUploadedPayload(event.payload),
  );
  if (!needsEnrich) return events;

  const reviewIds = [
    ...new Set(
      events
        .filter((event) => event.event_type === "artifact_uploaded")
        .map((event) => String(event.review_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (reviewIds.length === 0) return events;

  const { data: versionData, error } = await supabase
    .from("artifact_versions")
    .select(
      "id, version_number, review_id, created_at, artifact_id, artifacts ( id, name )",
    )
    .in("review_id", reviewIds);

  if (error || !versionData) return events;

  const reviewVersions = mapVersionRows(versionData);
  const artifactIds = [
    ...new Set(reviewVersions.map((row) => row.artifact_id).filter(Boolean)),
  ];

  let allVersions = reviewVersions;
  if (artifactIds.length > 0) {
    const { data: lineageData } = await supabase
      .from("artifact_versions")
      .select(
        "id, version_number, review_id, created_at, artifact_id, artifacts ( id, name )",
      )
      .in("artifact_id", artifactIds);
    if (lineageData) {
      allVersions = mapVersionRows(lineageData);
    }
  }

  const versionsByReview = new Map<string, VersionRow[]>();
  for (const row of reviewVersions) {
    const key = row.review_id ?? "";
    if (!key) continue;
    const bucket = versionsByReview.get(key) ?? [];
    bucket.push(row);
    versionsByReview.set(key, bucket);
  }

  return events.map((event) =>
    enrichSingleEvent(event, versionsByReview, allVersions),
  );
}

export async function resolveCrossReviewRelatedArtifact(
  supabase: SupabaseClient,
  canonicalArtifactId: string,
  currentReviewId: string,
  newVersionNumber: string,
): Promise<RelatedArtifactRef | null> {
  const canonicalId = canonicalArtifactId.trim();
  if (!canonicalId || hasExplicitSubVersion(newVersionNumber)) return null;

  const { data: artifactRow } = await supabase
    .from("artifacts")
    .select("id, name")
    .eq("id", canonicalId)
    .maybeSingle();
  const artifactName = String(
    (artifactRow as Record<string, unknown> | null)?.name ?? "",
  ).trim();
  if (!artifactName) return null;

  const { data: priorRows } = await supabase
    .from("artifact_versions")
    .select("version_number, review_id, created_at")
    .eq("artifact_id", canonicalId)
    .neq("review_id", currentReviewId)
    .order("created_at", { ascending: false })
    .limit(1);

  const prior = (priorRows ?? [])[0] as Record<string, unknown> | undefined;
  if (!prior) return null;

  return {
    id: canonicalId,
    name: artifactName,
    version: formatVersionLabel(String(prior.version_number ?? "v1")),
  };
}
