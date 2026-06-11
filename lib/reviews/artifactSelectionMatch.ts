export type ArtifactSelectionSource = {
  id: string;
  title?: string | null;
  label?: string | null;
};

/** Expand selected artifact ids to include title/label keys stored on change_requests. */
export function expandArtifactSelectionKeys(
  selectedIds: string[],
  artifacts: ArtifactSelectionSource[],
): Set<string> {
  const keys = new Set<string>();
  for (const id of selectedIds) {
    const trimmed = String(id ?? '').trim();
    if (!trimmed) continue;
    keys.add(trimmed);
    const match = artifacts.find((artifact) => artifact.id === trimmed);
    if (!match) continue;
    const title = match.title?.trim() ?? '';
    if (title) keys.add(title);
    const label = match.label?.trim() ?? '';
    if (label && label !== title) keys.add(label);
  }
  return keys;
}

export function changeRequestMatchesSelection(
  artifactIds: string[],
  selectionKeys: Set<string>,
): boolean {
  return artifactIds.some((id) => selectionKeys.has(String(id ?? '').trim()));
}
