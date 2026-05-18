"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
        backgroundColor: "#ebf6ee",
        border: "1px solid #7dc98f",
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: 13,
        fontWeight: 500,
        color: "#256b38",
        boxShadow: "0px 4px 12px rgba(41,33,28,0.12)",
        opacity,
        transition,
        maxWidth: 360,
      }}
      role="status"
    >
      {message}
    </div>,
    document.body
  );
}
