export type ArtifactModalInitialValues = {
  localKey?: string;
  canonicalArtifactId?: string | null;
  title?: string;
  linkUrl?: string;
  versionNumber?: number;
  description?: string;
  file?: File | null;
  fileUrl?: string | null;
  originalFileName?: string | null;
  baseType?: "Figma" | "PDF" | "Image";
};

export type ArtifactModalSavePayload = {
  localKey: string;
  canonicalArtifactId: string | null;
  kind: "link" | "file";
  title: string;
  iterationLabel: string;
  versionNumber: number;
  description: string;
  linkUrl: string;
  file: File | null;
  fileUrl: string | null;
  originalFileName: string | null;
  baseType: "Figma" | "PDF" | "Image";
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
