"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function formatCapturedOn(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ArtifactSnapshotLightbox({
  src,
  capturedAt,
  onClose,
}: {
  src: string;
  capturedAt?: string | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const capturedLabel = formatCapturedOn(capturedAt);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Artifact snapshot"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          maxWidth: "90vw",
          maxHeight: "90vh",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Artifact snapshot"
          style={{
            maxWidth: "90vw",
            maxHeight: "calc(90vh - 40px)",
            objectFit: "contain",
            borderRadius: 8,
            display: "block",
            background: "#fff",
          }}
        />
        {capturedLabel ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 500,
              color: "rgba(255, 255, 255, 0.85)",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Captured on {capturedLabel}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
