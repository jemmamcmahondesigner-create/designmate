export type ArtifactOpenTarget =
  | { kind: 'external'; url: string }
  | { kind: 'fullscreen-image'; src: string }
  | { kind: 'fullscreen-pdf'; src: string };

const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveArtifactOpenTarget(args: {
  linkUrl?: string | null;
  imageUrl?: string | null;
  fileType?: string | null;
}): ArtifactOpenTarget | null {
  const link = String(args.linkUrl ?? '').trim();
  if (link && isHttpUrl(link)) {
    return { kind: 'external', url: link };
  }
  const imageSrc = String(args.imageUrl ?? '').trim();
  if (!imageSrc) return null;
  const ft = String(args.fileType ?? '').trim().toLowerCase();
  if (ft === 'pdf') {
    return { kind: 'fullscreen-pdf', src: imageSrc };
  }
  if (!ft || IMAGE_TYPES.has(ft)) {
    return { kind: 'fullscreen-image', src: imageSrc };
  }
  return { kind: 'fullscreen-image', src: imageSrc };
}

export function openArtifactTarget(target: ArtifactOpenTarget): void {
  if (target.kind === 'external') {
    window.open(target.url, '_blank', 'noopener,noreferrer');
  }
}

/** URL for chip/link opens (always opens in a new tab). */
export function artifactChipHref(target: ArtifactOpenTarget | null): string | null {
  if (!target) return null;
  if (target.kind === 'external') return target.url;
  if (target.kind === 'fullscreen-image' || target.kind === 'fullscreen-pdf') {
    return target.src;
  }
  return null;
}
