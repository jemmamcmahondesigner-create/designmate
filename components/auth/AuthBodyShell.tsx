"use client";

import { useEffect } from "react";

/**
 * Applies auth-route body/html classes for page background and focus overrides.
 */
export function AuthBodyShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("auth-route");
    document.body.classList.add("auth-route");
    return () => {
      document.documentElement.classList.remove("auth-route");
      document.body.classList.remove("auth-route");
    };
  }, []);

  return <div className="auth-shell">{children}</div>;
}
