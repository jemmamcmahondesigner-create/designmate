"use client";

import { type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";

export function ProjectsBrowseShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        overflow: "hidden"
      }}
    >
      <Sidebar />
      <div
        style={{
          flex: "1 1 0",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        <main
          style={{
            flex: "1 1 0",
            minWidth: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#faf8f6"
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
