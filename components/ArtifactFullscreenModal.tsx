'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ArtifactOpenTarget } from '@/lib/artifacts/artifactOpenTarget';

export type ArtifactFullscreenPayload = Extract<
  ArtifactOpenTarget,
  { kind: 'fullscreen-image' } | { kind: 'fullscreen-pdf' }
>;

type ArtifactFullscreenModalProps = {
  payload: ArtifactFullscreenPayload | null;
  onClose: () => void;
};

export function ArtifactFullscreenModal({
  payload,
  onClose,
}: ArtifactFullscreenModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!payload) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [payload, onClose]);

  if (!payload || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Artifact preview"
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="Close"
        className="absolute border-0 bg-transparent text-white cursor-pointer"
        style={{
          top: 16,
          right: 16,
          width: 44,
          height: 44,
          fontSize: 28,
          lineHeight: 1,
        }}
        onClick={onClose}
      >
        ×
      </button>
      <div
        className="flex items-center justify-center"
        style={{ maxWidth: '90vw', maxHeight: '90vh', width: '100%', height: '100%' }}
      >
        {payload.kind === 'fullscreen-pdf' ? (
          <iframe
            src={payload.src}
            title="PDF preview"
            style={{
              width: 'min(90vw, 960px)',
              height: 'min(90vh, 720px)',
              border: 'none',
              background: '#ffffff',
            }}
          />
        ) : (
          <img
            src={payload.src}
            alt="Artifact preview"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
