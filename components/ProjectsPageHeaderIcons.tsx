"use client";

import { ChevronDown, MagnifyingGlass } from "@/lib/phosphor";

export function HeaderSearchIcon() {
  return (
    <MagnifyingGlass
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
      size={16}
      weight="fill"
      color="#998c82"
      aria-hidden
    />
  );
}

export function HeaderSplitChevron() {
  return <ChevronDown size={14} weight="fill" color="#ffffff" />;
}
