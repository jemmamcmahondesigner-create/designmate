"use client";

import { BookOpen, ChevronUp, SquaresFour } from "@/lib/phosphor";

export function SidebarLogoIcon() {
  return (
    <SquaresFour size={20} weight="fill" color="#6b1e2e" aria-hidden />
  );
}

export function SidebarProjectsNavIcon({ color }: { color: string }) {
  return <ChevronUp size={12} weight="fill" color={color} />;
}

export function SidebarReviewsNavIcon({ color }: { color: string }) {
  return <BookOpen size={20} weight="fill" color={color} />;
}
