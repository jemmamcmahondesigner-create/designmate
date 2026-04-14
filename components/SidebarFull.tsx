"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/ds";
import { SidebarLogoIcon } from "@/components/SidebarIcons";

const navTransition =
  "background-color 150ms ease, color 150ms ease, fill 150ms ease" as const;

function normalizePath(pathname: string | null): string {
  if (pathname == null) return "/";
  const n = pathname.replace(/\/$/, "") || "/";
  return n;
}

export function SidebarFull() {
  const pathname = usePathname();
  const path = normalizePath(pathname);

  const [hoverDashboard, setHoverDashboard] = useState(false);
  const [hoverArchive, setHoverArchive] = useState(false);
  const [hoverReviews, setHoverReviews] = useState(false);

  const onDashboard = path === "/dashboard";
  const onProjectsList = path === "/projects" || path.startsWith("/projects/");
  const onReviews = path === "/reviews";

  let dashboardBg: string;
  let dashboardFg: string;
  if (hoverDashboard) {
    dashboardBg = "#ede8e0";
    dashboardFg = "#2e1c1c";
  } else if (onDashboard) {
    dashboardBg = "#f7eff2";
    dashboardFg = "#6b1e2e";
  } else {
    dashboardBg = "#ffffff";
    dashboardFg = "#6b5e55";
  }

  let archiveBg: string;
  let archiveFg: string;
  if (hoverArchive) {
    archiveBg = "#ede8e0";
    archiveFg = "#2e1c1c";
  } else if (onProjectsList) {
    archiveBg = "#f7eff2";
    archiveFg = "#6b1e2e";
  } else {
    archiveBg = "#ffffff";
    archiveFg = "#6b5e55";
  }

  let reviewsBg: string;
  let reviewsFg: string;
  if (hoverReviews) {
    reviewsBg = "#ede8e0";
    reviewsFg = "#2e1c1c";
  } else if (onReviews) {
    reviewsBg = "#f7eff2";
    reviewsFg = "#6b1e2e";
  } else {
    reviewsBg = "#ffffff";
    reviewsFg = "#6b5e55";
  }

  return (
    <aside
      className="group flex w-[56px] shrink-0 flex-col overflow-x-hidden border-r border-[#ede8e0] bg-[#faf8f6] hover:w-[240px]"
      style={{
        minHeight: "100vh",
        transition: "width 200ms ease"
      }}
    >
      <div className="box-border flex h-[52px] shrink-0 items-center border-b-2 border-[#6b1e2e] pl-4 pr-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex shrink-0 items-center justify-center">
            <SidebarLogoIcon />
          </span>
          <span
            className="hidden min-w-0 truncate text-[20px] font-bold leading-[1.5] group-hover:inline-block"
            style={{ color: "#6b1e2e" }}
          >
            DesignMate
          </span>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col bg-white"
        style={{
          padding: "0 4px",
          flex: "1 1 auto",
          minHeight: 0
        }}
      >
        <p
          className="hidden text-[10px] font-semibold uppercase leading-[1.5] group-hover:block"
          style={{
            color: "#998c82",
            letterSpacing: "1px",
            paddingLeft: 20,
            paddingTop: 8,
            paddingBottom: 4
          }}
        >
          Workspace
        </p>
        <nav className="flex flex-col gap-1 px-0" aria-label="Workspace">
          <Link
            href="/dashboard"
            className="flex w-full shrink-0 items-center justify-center border-0 text-left no-underline group-hover:justify-between"
            style={{
              height: 40,
              minHeight: 40,
              marginTop: 4,
              padding: 0,
              borderRadius: 4,
              backgroundColor: dashboardBg,
              boxSizing: "border-box",
              transition: navTransition
            }}
            onMouseEnter={() => setHoverDashboard(true)}
            onMouseLeave={() => setHoverDashboard(false)}
          >
            <span
              className="flex h-full w-full items-center justify-center bg-transparent group-hover:hidden"
              style={{ padding: "6px 8px", color: dashboardFg }}
            >
              <Icon name="nav-mark" size={20} aria-label="Dashboard" />
            </span>
            <span
              className="hidden h-full w-full items-center bg-transparent group-hover:flex"
              style={{
                padding: "6px 12px 6px 20px",
                gap: 8
              }}
            >
              <span style={{ color: dashboardFg }}>
                <Icon name="nav-mark" size={20} aria-label="Dashboard" />
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[1.5]"
                style={{ color: dashboardFg, letterSpacing: "0.26px" }}
              >
                Dashboard
              </span>
              <span className="shrink-0" style={{ color: dashboardFg }}>
                <Icon
                  name="chevron-down"
                  size={12}
                  style={{ transform: "rotate(180deg)" }}
                />
              </span>
            </span>
          </Link>

          <Link
            href="/projects"
            className="flex w-full shrink-0 items-center justify-center border-0 text-left no-underline group-hover:justify-between"
            style={{
              height: 40,
              minHeight: 40,
              padding: 0,
              borderRadius: 4,
              backgroundColor: archiveBg,
              boxSizing: "border-box",
              transition: navTransition
            }}
            onMouseEnter={() => setHoverArchive(true)}
            onMouseLeave={() => setHoverArchive(false)}
          >
            <span
              className="flex h-full w-full items-center justify-center bg-transparent group-hover:hidden"
              style={{ padding: "6px 8px", color: archiveFg }}
            >
              <Icon name="nav-archive" size={20} aria-label="Archived reviews" />
            </span>
            <span
              className="hidden h-full w-full items-center bg-transparent group-hover:flex"
              style={{
                padding: "6px 12px 6px 20px",
                gap: 8
              }}
            >
              <span style={{ color: archiveFg }}>
                <Icon name="nav-archive" size={20} aria-label="Archived reviews" />
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[1.5]"
                style={{ color: archiveFg, letterSpacing: "0.26px" }}
              >
                Projects
              </span>
              <span className="shrink-0" style={{ color: archiveFg }}>
                <Icon
                  name="chevron-down"
                  size={12}
                  style={{ transform: "rotate(180deg)" }}
                />
              </span>
            </span>
          </Link>

          <Link
            href="/reviews"
            className="flex w-full shrink-0 items-center justify-center border-0 text-left no-underline group-hover:justify-between"
            style={{
              height: 40,
              minHeight: 40,
              padding: 0,
              borderRadius: 4,
              backgroundColor: reviewsBg,
              boxSizing: "border-box",
              transition: navTransition
            }}
            onMouseEnter={() => setHoverReviews(true)}
            onMouseLeave={() => setHoverReviews(false)}
          >
            <span
              className="flex h-full w-full items-center justify-center bg-transparent group-hover:hidden"
              style={{ padding: "6px 8px", color: reviewsFg }}
            >
              <Icon name="nav-reviews" size={20} aria-label="Reviews" />
            </span>
            <span
              className="hidden h-full w-full items-center bg-transparent group-hover:flex"
              style={{
                padding: "6px 12px 6px 20px",
                gap: 8
              }}
            >
              <span style={{ color: reviewsFg }}>
                <Icon name="nav-reviews" size={20} aria-label="Reviews" />
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[1.5]"
                style={{ color: reviewsFg, letterSpacing: "0.26px" }}
              >
                All Reviews
              </span>
              <span className="shrink-0" style={{ color: reviewsFg }}>
                <Icon name="chevron-right" size={12} />
              </span>
            </span>
          </Link>
        </nav>
      </div>

      <div
        className="shrink-0 border-t border-[#ede8e0] bg-white"
        style={{ flexShrink: 0 }}
      >
        <div
          className="flex items-center justify-center gap-0 group-hover:justify-start group-hover:gap-3 group-hover:px-5"
          style={{ paddingTop: 12, paddingBottom: 16 }}
        >
          <span
            className="shrink-0"
            style={{
              width: 24,
              height: 24,
              backgroundColor: "#e4ddd3",
              borderRadius: "50%"
            }}
            aria-hidden
          />
          <span
            className="hidden truncate text-[12px] font-medium leading-[1.5] group-hover:inline-block"
            style={{ color: "#6b5e55", letterSpacing: "0.24px" }}
          >
            Sarah Kim
          </span>
        </div>
      </div>
    </aside>
  );
}
