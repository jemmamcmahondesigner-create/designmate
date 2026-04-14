"use client";

import { Icon } from "@/components/ui/ds";
import { useNewReviewDrawer } from "@/components/NewReviewDrawerProvider";

export function ProjectsPageHeader() {
  const { openNewReview } = useNewReviewDrawer();

  const handleNewReview = () => {
    openNewReview({ mode: "global" });
  };

  return (
    <header
      className="flex h-12 w-full shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white px-8"
      style={{
        display: "flex",
        height: 48,
        width: "100%",
        flexShrink: 0,
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderBottom: "1px solid #ede8e0",
        backgroundColor: "#ffffff",
        paddingLeft: 32,
        paddingRight: 32
      }}
    >
      <div
        className="relative h-8 min-w-0 flex-1"
        style={{
          position: "relative",
          height: 32,
          minWidth: 0,
          flex: "1 1 auto",
          maxWidth: 600
        }}
      >
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#998c82]"
          aria-hidden
        >
          <Icon name="search" size={16} />
        </span>
        <input
          type="search"
          placeholder="Filter by project, client, or team member..."
          className="h-8 w-full border text-[13px] font-normal outline-none placeholder:text-[#998c82] focus:border-[#6b1e2e]"
          style={{
            height: 32,
            width: "100%",
            border: "1px solid #e4ddd3",
            borderRadius: 6,
            paddingLeft: 36,
            paddingRight: 12,
            lineHeight: 1.5,
            letterSpacing: "0.26px",
            color: "#2e1c1c",
            backgroundColor: "#ffffff"
          }}
          aria-label="Filter by project, client, or team member"
        />
      </div>
      <div
        className="flex h-8 shrink-0 overflow-hidden"
        style={{
          display: "flex",
          height: 32,
          flexShrink: 0,
          overflow: "hidden",
          borderRadius: 6
        }}
      >
        <button
          type="button"
          className="border-0 px-3 text-[13px] font-medium leading-[1.5] text-white"
          style={{
            backgroundColor: "#6b1e2e",
            letterSpacing: "0.26px",
            borderRadius: "6px 0 0 6px",
            border: "none",
            color: "#ffffff",
            paddingLeft: 12,
            paddingRight: 12
          }}
          onClick={handleNewReview}
        >
          New Review
        </button>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center border-0"
          style={{
            display: "flex",
            height: 32,
            width: 32,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#6b1e2e",
            borderLeft: "1px solid rgba(255,255,255,0.25)",
            borderRadius: "0 6px 6px 0",
            border: "none",
            padding: 0
          }}
          aria-label="New review options"
          onClick={handleNewReview}
        >
          <span className="inline-flex text-white">
            <Icon name="chevron-down" size={14} />
          </span>
        </button>
      </div>
    </header>
  );
}
