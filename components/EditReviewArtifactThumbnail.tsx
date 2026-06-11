'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/ds';

type EditReviewArtifactThumbnailProps = {
  title: string;
  kind: 'file' | 'link';
  linkUrl?: string | null;
  fileUrl?: string | null;
  originalFileName?: string | null;
  baseType: 'Figma' | 'PDF' | 'Image';
};

function isFigmaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'figma.com' || host === 'www.figma.com';
  } catch {
    return false;
  }
}

function googleDocKind(url: string): 'docs' | 'sheets' | 'slides' | null {
  try {
    const path = new URL(url).pathname;
    if (path.includes('/document/')) return 'docs';
    if (path.includes('/spreadsheets/')) return 'sheets';
    if (path.includes('/presentation/')) return 'slides';
  } catch {
    return null;
  }
  return null;
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

function PlaceholderCard({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center"
      style={{ background: '#f3efe9', color: '#6b5e55' }}
    >
      {icon}
      <span className="max-w-full truncate text-[13px] font-medium text-[#2e1c1c]">{title}</span>
      <span className="text-[12px] text-[#998c82]">{subtitle}</span>
    </div>
  );
}

export function EditReviewArtifactThumbnail({
  title,
  kind,
  linkUrl,
  fileUrl,
  originalFileName,
  baseType,
}: EditReviewArtifactThumbnailProps) {
  const displayTitle = title.trim() || originalFileName?.trim() || 'Untitled';
  const rawLink = String(linkUrl ?? '').trim();
  const rawFile = String(fileUrl ?? '').trim();
  const isImageUpload =
    kind === 'file' &&
    baseType === 'Image' &&
    rawFile.length > 0;
  const isPdfUpload = kind === 'file' && baseType === 'PDF';

  let content: ReactNode;
  if (isImageUpload) {
    content = (
      <img
        src={rawFile}
        alt={displayTitle}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    );
  } else if (isPdfUpload) {
    content = (
      <PlaceholderCard
        icon={<span style={{ fontSize: 13, fontWeight: 600, color: '#6b1e2e' }}>PDF</span>}
        title={originalFileName?.trim() || displayTitle}
        subtitle="PDF"
      />
    );
  } else if (rawLink && isFigmaUrl(rawLink)) {
    content = (
      <PlaceholderCard
        icon={<span style={{ fontSize: 13, fontWeight: 600, color: '#6b1e2e' }}>Figma</span>}
        title={displayTitle}
        subtitle="Figma"
      />
    );
  } else if (rawLink && googleDocKind(rawLink)) {
    const gKind = googleDocKind(rawLink);
    const label =
      gKind === 'sheets' ? 'Google Sheets' : gKind === 'slides' ? 'Google Slides' : 'Google Docs';
    content = (
      <PlaceholderCard
        icon={<Icon name="link" size={28} />}
        title={displayTitle}
        subtitle={label}
      />
    );
  } else if (rawLink) {
    content = (
      <PlaceholderCard
        icon={<Icon name="link" size={28} />}
        title={displayTitle}
        subtitle={hostnameFromUrl(rawLink)}
      />
    );
  } else {
    content = (
      <PlaceholderCard
        icon={<Icon name="upload" size={28} />}
        title={displayTitle}
        subtitle="Artifact"
      />
    );
  }

  return (
    <div
      className="w-full overflow-hidden rounded-[8px] border border-[#e4ddd3]"
      style={{ aspectRatio: '16 / 9' }}
    >
      {content}
    </div>
  );
}
