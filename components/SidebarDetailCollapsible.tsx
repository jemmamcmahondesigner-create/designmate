"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Archive,
  BookOpen,
  ChevronRight,
  ChevronUp
} from "@/lib/phosphor";
import { SidebarLogoIcon } from "@/components/SidebarIcons";

const navTransition =
  "background-color 150ms ease, color 150ms ease, fill 150ms ease" as const;

type SidebarDetailCollapsibleProps = {
  projectName: string;
  clientName: string;
  recentProjects: {
    id: string;
    name: string;
    client: string | null;
  }[];
};

function normalizePath(pathname: string | null): string {
  if (pathname == null) return "/";
  const n = pathname.replace(/\/$/, "") || "/";
  return n;
}

export function SidebarDetailCollapsible({
  projectName,
  clientName,
  recentProjects
}: SidebarDetailCollapsibleProps) {
  const pathname = usePathname();
  const path = normalizePath(pathname);
  const routeProjectId =
    pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null;

  const [hoverProjects, setHoverProjects] = useState(false);
  const [hoverReviews, setHoverReviews] = useState(false);
  const [hoverCurrentBlock, setHoverCurrentBlock] = useState(false);
  const [hoveredSecondaryId, setHoveredSecondaryId] = useState<string | null>(
    null
  );

  const onProjectsList = path === "/projects";

  let projectsBg: string;
  let projectsFg: string;
  if (hoverProjects) {
    projectsBg = "#ede8e0";
    projectsFg = "#2e1c1c";
  } else if (onProjectsList) {
    projectsBg = "#f7eff2";
    projectsFg = "#6b1e2e";
  } else {
    projectsBg = "#ffffff";
    projectsFg = "#6b5e55";
  }

  const onReviews = path === "/reviews";
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
        <nav className="flex flex-col gap-0 px-0" aria-label="Workspace">
          <Link
            href="/projects"
            className="flex w-full shrink-0 items-center justify-center border-0 text-left no-underline group-hover:justify-between"
            style={{
              height: 40,
              minHeight: 40,
              marginTop: 4,
              padding: 0,
              borderRadius: 4,
              backgroundColor: projectsBg,
              boxSizing: "border-box",
              transition: navTransition
            }}
            onMouseEnter={() => setHoverProjects(true)}
            onMouseLeave={() => setHoverProjects(false)}
          >
            <span
              className="flex h-full w-full items-center justify-center bg-transparent group-hover:hidden"
              style={{ padding: "6px 8px" }}
            >
              <Archive size={20} weight="fill" color={projectsFg} aria-hidden />
            </span>
            <span
              className="hidden h-full w-full items-center bg-transparent group-hover:flex"
              style={{
                padding: "6px 12px 6px 20px",
                gap: 8
              }}
            >
              <Archive size={20} weight="fill" color={projectsFg} aria-hidden />
              <span
                className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[1.5]"
                style={{ color: projectsFg, letterSpacing: "0.26px" }}
              >
                Projects
              </span>
              <ChevronUp
                size={12}
                weight="fill"
                color={projectsFg}
                aria-hidden
                className="shrink-0"
              />
            </span>
          </Link>
          <div
            className="hidden flex-col group-hover:flex"
            style={{ marginTop: 4 }}
          >
          <div
            className="flex w-full cursor-default"
            style={{
              height: 40,
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 18px 6px 16px",
              borderRadius: 4,
              maxWidth: "100%",
              overflow: "hidden",
              transition: navTransition,
              backgroundColor: hoverCurrentBlock ? "#ede8e0" : "#f5eaec"
            }}
            onMouseEnter={() => setHoverCurrentBlock(true)}
            onMouseLeave={() => setHoverCurrentBlock(false)}
          >
            <div
              style={{
                minWidth: 0,
                flex: 1,
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: hoverCurrentBlock ? "#2e1c1c" : "#6b1e2e",
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  transition: navTransition
                }}
                title={projectName}
              >
                {projectName}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#6b5e55",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  transition: navTransition
                }}
                title={clientName}
              >
                {clientName}
              </div>
            </div>
            <span
              aria-hidden
              style={{
                marginLeft: 10,
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#3b9b54",
                flexShrink: 0
              }}
            />
          </div>
          {recentProjects.map((p) => {
            const recentClient = p.client?.trim() || "Internal Project";
            const isActive = p.id === routeProjectId;
            const isHover = hoveredSecondaryId === p.id;
            let bg = "#ffffff";
            let nameC = "#6b5e55";
            let clientC = "#998c82";
            if (isHover) {
              bg = "#ede8e0";
              nameC = "#2e1c1c";
              clientC = "#6b5e55";
            } else if (isActive) {
              bg = "#f5eaec";
              nameC = "#6b1e2e";
              clientC = "#6b5e55";
            }
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="hidden w-full no-underline group-hover:flex"
                style={{
                  height: 40,
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 18px 6px 16px",
                  borderRadius: 4,
                  backgroundColor: bg,
                  maxWidth: "100%",
                  overflow: "hidden",
                  transition: navTransition
                }}
                onMouseEnter={() => setHoveredSecondaryId(p.id)}
                onMouseLeave={() => setHoveredSecondaryId(null)}
              >
                <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: nameC,
                      lineHeight: 1.3,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      transition: navTransition
                    }}
                    title={p.name}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 10,
                      fontWeight: 600,
                      color: clientC,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      transition: navTransition
                    }}
                    title={recentClient}
                  >
                    {recentClient}
                  </div>
                </div>
                <span
                  aria-hidden
                  style={{
                    marginLeft: 10,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#3b9b54",
                    flexShrink: 0
                  }}
                />
              </Link>
            );
          })}
          {recentProjects.length === 5 ? (
            <Link
              href="/projects"
              className="hidden self-start text-[12px] font-normal leading-[1.5] no-underline group-hover:inline-block"
              style={{
                marginTop: 6,
                marginLeft: 16,
                color: "#998c82",
                letterSpacing: "0.24px",
                textDecorationLine: "underline",
                textUnderlineOffset: "2px"
              }}
            >
              View all
            </Link>
          ) : null}
          </div>

          <Link
            href="/reviews"
            className="flex w-full shrink-0 items-center justify-center border-0 text-left no-underline group-hover:justify-between"
            style={{
              height: 40,
              minHeight: 40,
              marginTop: 4,
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
              style={{ padding: "6px 8px" }}
            >
              <BookOpen size={20} weight="fill" color={reviewsFg} aria-hidden />
            </span>
            <span
              className="hidden h-full w-full items-center bg-transparent group-hover:flex"
              style={{
                padding: "6px 12px 6px 20px",
                gap: 8
              }}
            >
              <BookOpen size={20} weight="fill" color={reviewsFg} aria-hidden />
              <span
                className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[1.5]"
                style={{ color: reviewsFg, letterSpacing: "0.26px" }}
              >
                All Reviews
              </span>
              <ChevronRight
                size={12}
                weight="fill"
                color={reviewsFg}
                aria-hidden
                className="shrink-0"
              />
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
