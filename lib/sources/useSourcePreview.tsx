"use client";

import { useCallback, useState, type ReactNode } from "react";
import { SourceFileViewer } from "@/components/project-detail/SourceFileViewer";

/** Minimal source shape needed to open a preview or external link. */
export type SourcePreviewTarget = {
  id: string;
  label: string;
  url: string | null;
  file_name: string | null;
  storage_path: string | null;
  file_type: string | null;
};

export type SourcePreviewKind = "file" | "link" | "none";

/**
 * Decide how a source should open:
 * - storage_path present → in-app file viewer
 * - url-only (no storage_path) → new tab
 * - neither → non-interactive
 */
export function classifySourcePreview(source: {
  storage_path: string | null | undefined;
  url: string | null | undefined;
}): SourcePreviewKind {
  const hasStorage =
    source.storage_path != null && String(source.storage_path).trim() !== "";
  if (hasStorage) return "file";
  const hasUrl = source.url != null && String(source.url).trim() !== "";
  if (hasUrl) return "link";
  return "none";
}

/**
 * Holds SourceFileViewer open state and opens file sources in-app /
 * link sources in a new tab.
 */
export function useSourcePreview() {
  const [viewing, setViewing] = useState<SourcePreviewTarget | null>(null);

  const closePreview = useCallback(() => {
    setViewing(null);
  }, []);

  const openSource = useCallback((source: SourcePreviewTarget) => {
    const kind = classifySourcePreview(source);
    if (kind === "file") {
      setViewing(source);
      return;
    }
    if (kind === "link") {
      const href = String(source.url ?? "").trim();
      if (href) {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    }
  }, []);

  const preview: ReactNode = viewing ? (
    <SourceFileViewer reference={viewing} onClose={closePreview} />
  ) : null;

  return {
    viewing,
    openSource,
    closePreview,
    preview,
    classifySourcePreview,
  };
}
