"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Alert } from "@/components/ui/ds";

/**
 * Fixed-corner success toast. Matches `Toast.tsx` visually (DS Alert,
 * sentiment="success") while keeping a local mount API for call sites that
 * need left/right placement and their own dismiss lifecycle.
 */
export function FixedToastPortal({
  message,
  onDone,
  placement = "bottom-left",
}: {
  message: string;
  onDone: () => void;
  /** Horizontal anchor for the toast strip. */
  placement?: "bottom-left" | "bottom-right";
}) {
  const [opacity, setOpacity] = useState(0);
  const [transition, setTransition] = useState("opacity 200ms ease");
  const [mounted, setMounted] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => setOpacity(1));
    });
    const startFadeOut = window.setTimeout(() => {
      setTransition("opacity 500ms ease");
      setOpacity(0);
    }, 3500);
    const remove = window.setTimeout(() => {
      onDoneRef.current();
    }, 4000);
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      window.clearTimeout(startFadeOut);
      window.clearTimeout(remove);
    };
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  const horizontal =
    placement === "bottom-right"
      ? { right: 24 as const, left: "auto" as const }
      : { left: 24 as const, right: "auto" as const };

  return createPortal(
    <div
      className="fixed z-50"
      style={{
        bottom: 24,
        ...horizontal,
        opacity,
        transition,
        width: "fit-content",
        maxWidth: "min(360px, calc(100vw - 48px))",
      }}
      role="status"
    >
      <Alert
        sentiment="success"
        prominence="low"
        title={message}
        dismissible={false}
        className="w-full"
      />
    </div>,
    document.body,
  );
}
