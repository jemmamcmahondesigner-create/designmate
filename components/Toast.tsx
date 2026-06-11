"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Alert } from "@/components/ui/ds";

export type ToastShowOptions = {
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastContextValue = {
  showToast: (messageOrOptions?: string | ToastShowOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_MESSAGE = "Changes saved";

function buildToast(messageOrOptions?: string | ToastShowOptions): Toast {
  const opts =
    typeof messageOrOptions === "string" || messageOrOptions == null
      ? { message: messageOrOptions }
      : messageOrOptions;
  return {
    id: 0,
    message: opts.message?.trim() || DEFAULT_MESSAGE,
    actionLabel: opts.actionLabel,
    onAction: opts.onAction,
  };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const idRef = useRef(0);
  const queueRef = useRef<Toast[]>([]);

  const showNextToast = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    setToast(next);
  }, []);

  const showToast = useCallback((messageOrOptions?: string | ToastShowOptions) => {
    idRef.current += 1;
    const item = { ...buildToast(messageOrOptions), id: idRef.current };
    setToast((current) => {
      if (current === null) return item;
      queueRef.current.push(item);
      return current;
    });
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <ToastPortal
          key={toast.id}
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          onDone={showNextToast}
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

function ToastPortal({
  message,
  actionLabel,
  onAction,
  onDone,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDone: () => void;
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
        opacity,
        transition,
        width: "min(360px, calc(100vw - 48px))",
      }}
    >
      <Alert
        sentiment="success"
        prominence="low"
        title={message}
        actionLabel={actionLabel}
        onAction={onAction}
        dismissible={false}
        className="w-full shadow-[0_4px_12px_rgba(41,33,28,0.12)]"
      />
    </div>,
    document.body
  );
}
