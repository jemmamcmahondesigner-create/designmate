import type { ArtifactPreviewFileType } from "@/components/ui/ds";

function extensionFromFileName(fileName: string | null | undefined): string {
  const name = String(fileName ?? "").trim().toLowerCase();
  if (!name.includes(".")) return "";
  return name.split(".").pop() ?? "";
}

function fileTypeFromMime(mimeType: string | null | undefined): ArtifactPreviewFileType | null {
  const mime = String(mimeType ?? "").trim().toLowerCase();
  if (!mime) return null;
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/gif") return "gif";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpeg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return null;
}

function fileTypeFromExtension(ext: string): ArtifactPreviewFileType | null {
  switch (ext) {
    case "pdf":
      return "pdf";
    case "gif":
      return "gif";
    case "jpg":
      return "jpg";
    case "jpeg":
      return "jpeg";
    case "png":
      return "png";
    case "webp":
      return "webp";
    case "svg":
      return "svg";
    default:
      return null;
  }
}

/** Resolve DS preview file type from stored artifact fields (mime, filename, link). */
export function resolveArtifactPreviewFileType(input: {
  type?: "Figma" | "PDF" | "Image" | string | null;
  linkUrl?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
}): ArtifactPreviewFileType {
  const link = String(input.linkUrl ?? "").trim();
  if (link) {
    if (link.toLowerCase().includes("figma.com")) return "figma";
    return "link";
  }

  const fromMime = fileTypeFromMime(input.mimeType);
  if (fromMime) return fromMime;

  const fromName = fileTypeFromExtension(extensionFromFileName(input.originalFileName));
  if (fromName) return fromName;

  const coarse = String(input.type ?? "").trim();
  if (coarse === "Figma") return "figma";
  if (coarse === "PDF") return "pdf";

  return "jpeg";
}
