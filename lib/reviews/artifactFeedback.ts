import { expandArtifactSelectionKeys } from '@/lib/reviews/artifactSelectionMatch';

type ArtifactRef = { id: string; title?: string | null; label?: string | null };

type FeedbackRef = {
  status: string;
  selectedOption?: string | null;
};

type ChangeRequestRef = {
  artifact_ids: string[];
};

/** Artifact ids referenced by submitted feedback or change requests on this review. */
export function artifactIdsWithReceivedFeedback(
  artifacts: ArtifactRef[],
  allFeedbackRows: FeedbackRef[],
  changeRequests: ChangeRequestRef[],
): Set<string> {
  const ids = new Set<string>();
  for (const cr of changeRequests) {
    for (const rawId of cr.artifact_ids) {
      const trimmed = String(rawId ?? '').trim();
      if (!trimmed) continue;
      for (const artifact of artifacts) {
        const keys = expandArtifactSelectionKeys([artifact.id], [artifact]);
        if (keys.has(trimmed)) {
          ids.add(artifact.id);
        }
      }
    }
  }
  for (const row of allFeedbackRows) {
    if (row.status !== 'submitted') continue;
    const opt = String(row.selectedOption ?? '').trim();
    if (!opt) continue;
    for (const artifact of artifacts) {
      const keys = expandArtifactSelectionKeys([artifact.id], [artifact]);
      if (keys.has(opt)) {
        ids.add(artifact.id);
      }
    }
  }
  return ids;
}
