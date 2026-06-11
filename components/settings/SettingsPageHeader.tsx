"use client";

import { usePathname } from "next/navigation";

function breadcrumbPageTitle(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  if (last === "profile") return "Your Profile";
  if (last === "subscription") return "Subscription";
  if (last === "clients") return "Groups";
  if (!last || last === "settings") return "";
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export function SettingsPageHeader() {
  const pathname = usePathname() ?? "";
  const pageTitle = breadcrumbPageTitle(pathname);
  const crumbText = pageTitle ? `Settings / ${pageTitle}` : "Settings";

  return (
    <header
      style={{
        flexShrink: 0,
        height: 48,
        width: "100%",
        boxSizing: "border-box",
        background: "var(--surface-app-header, #ffffff)",
        borderBottom: "1px solid var(--border-subtle, #ede8e0)",
        paddingLeft: 24,
        paddingRight: 12,
        display: "flex",
        alignItems: "center",
      }}
    >
      <nav aria-label="Settings breadcrumb" style={{ display: "flex", alignItems: "center", height: "100%" }}>
        <span
          style={{
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 1.5,
            color: "var(--text-secondary, #6b5e55)",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {crumbText}
        </span>
      </nav>
    </header>
  );
}
