"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export function AllReviewsShell({
  children,
  headerSlot,
}: {
  children: ReactNode;
  headerSlot?: ReactNode;
}) {
  const pathname = usePathname();
  const isReviewsList =
    pathname === "/reviews" || pathname === "/reviews/";
  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <Sidebar />
      <div
        style={{
          flex: "1 1 0",
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {isReviewsList && headerSlot ? (
          <header
            style={{
              flexShrink: 0,
              padding: "16px 24px",
              borderBottom: "1px solid #ede8e0",
              background: "#faf8f6",
            }}
          >
            {headerSlot}
          </header>
        ) : null}
        <main
          style={{
            flex: "1 1 0",
            minHeight: 0,
            overflowY: "auto",
            backgroundColor: "#faf8f6",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
