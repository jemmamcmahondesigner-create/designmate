"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Toast = {
  id: number;
  message: string;
};

type ToastContextValue = {
  showToast: (message?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_MESSAGE = "Changes saved";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const idRef = useRef(0);

  const showToast = useCallback((message?: string) => {
    idRef.current += 1;
    setToast({ id: idRef.current, message: message?.trim() || DEFAULT_MESSAGE });
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <ToastPortal
          key={toast.id}
          message={toast.message}
          onDone={() => setToast((current) => (current && current.id === toast.id ? null : current))}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: () => {
        if (process.env.NODE_ENV === "development") {
          console.warn("useToast called outside <ToastProvider>");
        }
      },
    };
  }
  return ctx;
}

function ToastPortal({ message, onDone }: { message: string; onDone: () => void }) {
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
      setTransition("opacity 300ms ease");
      setOpacity(0);
    }, 2700);
    const removeAt = window.setTimeout(() => {
      onDoneRef.current();
    }, 3000);
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      window.clearTimeout(startFadeOut);
      window.clearTimeout(removeAt);
    };
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1000,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        backgroundColor: "#ebf6ee",
        border: "1px solid #7dc98f",
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: 13,
        fontWeight: 500,
        color: "#256b38",
        boxShadow: "0px 4px 12px rgba(41,33,28,0.12)",
        opacity,
        transition,
        maxWidth: 360,
      }}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden style={{ display: "inline-flex", flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="#2a8a45" />
          <path
            d="M7.5 12l3 3 6-6"
            stroke="#ffffff"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{message}</span>
    </div>,
    document.body
  );
}
