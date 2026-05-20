"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Button, Select, Avatar } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SidebarSettingsMenuProps = {
  open: boolean;
  onClose: () => void;
  displayName: string;
  roleLabel: string;
};

const SETTINGS_ITEMS = [
  { label: "Teammates", href: "/settings/teammates" },
  { label: "Roles", href: "/settings/roles" },
  { label: "Permissions", href: "/settings/permissions" },
  { label: "Clients", href: "/settings/clients" },
] as const;

const MENU_WIDTH = 229;
/** Inset from viewport left; sits above 48px footer + 8px gap. */
const MENU_LEFT = 8;
const MENU_BOTTOM = 56;

export function SidebarSettingsMenu({
  open,
  onClose,
  displayName,
  roleLabel,
}: SidebarSettingsMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [workspace, setWorkspace] = useState("core-solutions");
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  const activePath = useMemo(() => pathname ?? "", [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      const t = event.target as HTMLElement | null;
      if (t?.closest?.("[data-settings-trigger]")) return;
      const panel = document.getElementById("settings-popover-panel");
      if (panel?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open, onClose]);

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    onClose();
  };

  if (!open) return null;

  const panel = (
    <div
      id="settings-popover-panel"
      role="menu"
      aria-label="Settings menu"
      style={{
        position: "fixed",
        left: MENU_LEFT,
        bottom: MENU_BOTTOM,
        width: MENU_WIDTH,
        background: "var(--surface-card-default, #ffffff)",
        border: "1px solid var(--border-default, #e4ddd3)",
        borderRadius: 8,
        boxShadow:
          "0px 2px 4px rgba(41, 33, 28, 0.06), 0px 8px 16px rgba(41, 33, 28, 0.15)",
        zIndex: 200,
        overflow: "hidden",
      }}
    >
      {/* Workspace section */}
      <div style={workspaceSectionStyle}>
        <div style={{ padding: 12 }}>
          <Select
            options={[{ value: "core-solutions", label: "Core Solutions" }]}
            value={workspace}
            onChange={(value) => {
              setWorkspace(value);
              // TODO: workspace switching
            }}
            size="sm"
          />
        </div>

        <div style={workspaceHeadingWrapStyle}>
          <p style={workspaceHeadingTextStyle}>WORKSPACE</p>
        </div>
        <div style={headingDividerStyle} />

        {SETTINGS_ITEMS.map((item) => (
          <button
            key={item.href}
            type="button"
            onMouseEnter={() => setHoveredHref(item.href)}
            onMouseLeave={() => setHoveredHref(null)}
            style={menuItemStyle(activePath === item.href, hoveredHref === item.href)}
            onClick={() => navigate(item.href)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Your account section */}
      <div style={accountSectionStyle}>
        <div style={accountHeadingWrapStyle}>
          <p style={workspaceHeadingTextStyle}>YOUR ACCOUNT</p>
        </div>
        <div style={headingDividerStyle} />

        <button
          type="button"
          onMouseEnter={() => setHoveredHref("/settings/profile")}
          onMouseLeave={() => setHoveredHref(null)}
          style={menuItemStyle(
            activePath === "/settings/profile",
            hoveredHref === "/settings/profile",
          )}
          onClick={() => navigate("/settings/profile")}
        >
          Your Profile
        </button>

        <button
          type="button"
          style={menuItemStyle(false, false, true)}
          disabled
          aria-disabled
        >
          Subscription
        </button>
      </div>

      <div style={footerBlockStyle}>
        <div style={footerIdentityRowStyle}>
          <div style={{ minWidth: 0, flex: "1 1 0" }}>
            <p style={footerNameStyle}>{displayName}</p>
            {roleLabel.trim() ? <p style={footerRoleStyle}>{roleLabel}</p> : null}
          </div>
          <span aria-hidden="true">
            <Avatar name={displayName} size="lg" />
          </span>
        </div>
        <Button
          label="Log Out"
          variant="primary"
          size="sm"
          onClick={() => void signOut()}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

const workspaceSectionStyle: CSSProperties = {
  background: "var(--surface-card-default, #ffffff)",
};

const accountSectionStyle: CSSProperties = {
  borderTop: "1px solid var(--border-default, #e4ddd3)",
  background: "var(--surface-card-default, #ffffff)",
};

const workspaceHeadingWrapStyle: CSSProperties = {
  margin: 0,
  padding: "4px 0 0 0",
  height: 32,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  paddingLeft: 12,
  paddingRight: 12,
};

const accountHeadingWrapStyle: CSSProperties = {
  ...workspaceHeadingWrapStyle,
  marginTop: 0,
};

const workspaceHeadingTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "#6b1e2e",
};

const headingDividerStyle: CSSProperties = {
  height: 1,
  background: "var(--border-default, #e4ddd3)",
  margin: 0,
};

const footerBlockStyle: CSSProperties = {
  background: "var(--surface-card-recessed, #f3efe9)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  boxSizing: "border-box",
};

const footerIdentityRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const footerNameStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "var(--text-secondary, #6b5e55)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const footerRoleStyle: CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "var(--text-tertiary, #998c82)",
};

function menuItemStyle(
  active: boolean,
  hovered: boolean,
  disabled?: boolean,
): CSSProperties {
  return {
    width: "100%",
    height: 37,
    boxSizing: "border-box",
    border: "none",
    textAlign: "left",
    padding: "8px 12px",
    background: active
      ? "var(--interactive-selected-surface, #f5eaec)"
      : hovered && !disabled
        ? "var(--interactive-hover-surface-strong, #ede8e0)"
        : "transparent",
    color: active ? "var(--text-heading, #6b1e2e)" : "var(--text-primary, #2e1c1c)",
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? "default" : "pointer",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    opacity: disabled ? 0.55 : 1,
  };
}
