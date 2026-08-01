"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Button, Avatar, Icon, Menu, Tooltip } from "@/components/ui/ds";
import type { WorkspacePermissionLevel } from "@/lib/workspace/permissions";
import menuStyles from "@/components/ui/ds/Menu.module.css";
import selectStyles from "@/components/ui/ds/Select.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAvatarInlineStyle, avatarColourKey } from "@/lib/utils/avatarColour";

type SidebarSettingsMenuProps = {
  open: boolean;
  onClose: () => void;
  contributorId: string | null;
  contributorEmail?: string | null;
  displayName: string;
  roleLabel: string;
  workspaceOptions: Array<{ value: string; label: string }>;
  workspaceValue: string | null;
  workspacePermissionLevel?: WorkspacePermissionLevel | null;
};

const SETTINGS_ITEMS = [
  { label: "Teammates", href: "/settings/teammates" },
  { label: "Roles", href: "/settings/roles" },
  { label: "Permissions", href: "/settings/permissions" },
  { label: "Groups", href: "/settings/clients" },
] as const;

const MENU_WIDTH = 229;
/** Inset from viewport left; sits above 48px footer + 8px gap. */
const MENU_LEFT = 8;
const MENU_BOTTOM = 56;
const WORKSPACE_SWITCHER_MENU_ID = "workspace-switcher-menu";

function workspaceShortId(id: string): string {
  return id.trim().slice(0, 8);
}

type WorkspaceSwitcherSelectProps = {
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  switching?: boolean;
};

function WorkspaceSwitcherSelect({
  options,
  value,
  onChange,
  disabled = false,
  switching = false,
}: WorkspaceSwitcherSelectProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (switching) setOpen(true);
  }, [switching]);

  const selected = options.find((option) => option.value === value);
  const displayLabel = switching
    ? "Switching workspace…"
    : (selected?.label ?? "Select workspace");

  return (
    <div className={selectStyles.root}>
      <div className={selectStyles.wrapper}>
        <button
          ref={anchorRef}
          type="button"
          className={[
            selectStyles.control,
            selectStyles["size-sm"],
            disabled ? selectStyles.disabled : "",
            open ? selectStyles.open : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled || switching}
          onClick={() => {
            if (disabled || switching) return;
            setOpen((current) => !current);
          }}
        >
          <span className={selectStyles.valueText}>{displayLabel}</span>
          <Icon
            name="chevron-down"
            size={16}
            className={[
              selectStyles.chevron,
              open ? selectStyles.chevronOpen : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden
          />
        </button>

        <Menu
          id={WORKSPACE_SWITCHER_MENU_ID}
          open={open}
          onClose={() => {
            if (switching) return;
            setOpen(false);
          }}
          anchorRef={anchorRef}
          align="left"
          portal
          portalZIndex={250}
          type="context-menu"
          aria-label="Switch workspace"
        >
          {options.map((option) => {
            const isActive = option.value === value;
            const itemDisabled = disabled || switching;
            return (
              <li
                key={option.value}
                role="menuitem"
                tabIndex={itemDisabled ? -1 : 0}
                aria-disabled={itemDisabled}
                className={[
                  menuStyles.item,
                  isActive ? menuStyles.itemActive : "",
                  itemDisabled ? menuStyles.itemDisabled : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (itemDisabled) return;
                  onChange(option.value);
                }}
              >
                <span className={menuStyles.itemLabel}>
                  <span style={{ color: "var(--text-disabled, #c9c0b4)" }}>
                    {workspaceShortId(option.value)}
                  </span>
                  <span> · </span>
                  <span>{option.label}</span>
                </span>
                {isActive ? (
                  <span
                    className={menuStyles.itemCheck}
                    aria-hidden="true"
                    style={{ color: "#6b1e2e" }}
                  >
                    <Icon name="check" size={16} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </Menu>
      </div>
    </div>
  );
}

export function SidebarSettingsMenu({
  open,
  onClose,
  contributorId,
  contributorEmail = null,
  displayName,
  roleLabel,
  workspaceOptions,
  workspaceValue,
  workspacePermissionLevel = null,
}: SidebarSettingsMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    workspaceValue,
  );
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [workspaceSwitchError, setWorkspaceSwitchError] = useState<string | null>(null);

  const activePath = useMemo(() => pathname ?? "", [pathname]);
  const showWorkspaceSelect = workspaceOptions.length > 1;
  useEffect(() => {
    setSelectedWorkspaceId(workspaceValue);
  }, [workspaceValue]);

  useEffect(() => {
    if (!open) return;
    setWorkspaceSwitchError(null);
  }, [open]);

  const handleWorkspaceChange = useCallback(
    async (newValue: string) => {
      if (switchingWorkspace || newValue === selectedWorkspaceId) return;

      const previousValue = selectedWorkspaceId;
      setWorkspaceSwitchError(null);
      setSwitchingWorkspace(true);
      setSelectedWorkspaceId(newValue);

      const { error } = await supabase.auth.updateUser({
        data: { active_workspace_id: newValue },
      });

      if (error) {
        setSelectedWorkspaceId(previousValue);
        setWorkspaceSwitchError("Couldn't switch workspace");
        setSwitchingWorkspace(false);
        return;
      }

      window.location.href = "/projects";
      onClose();
      setSwitchingWorkspace(false);
    },
    [onClose, selectedWorkspaceId, supabase, switchingWorkspace],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !switchingWorkspace) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, switchingWorkspace]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (switchingWorkspace) return;

      const t = event.target as HTMLElement | null;
      if (t?.closest?.("[data-settings-trigger]")) return;
      if (t?.closest?.(`#${WORKSPACE_SWITCHER_MENU_ID}`)) return;

      const panel = document.getElementById("settings-popover-panel");
      if (panel?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open, onClose, switchingWorkspace]);

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
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
        <div style={workspaceHeadingWrapStyle}>
          <p style={workspaceHeadingTextStyle}>WORKSPACE</p>
        </div>

        <div style={headingDividerStyle} />

        {showWorkspaceSelect ? (
          <div style={{ padding: 12 }}>
            <WorkspaceSwitcherSelect
              options={workspaceOptions}
              value={selectedWorkspaceId}
              onChange={(newValue) => void handleWorkspaceChange(newValue)}
              disabled={switchingWorkspace}
              switching={switchingWorkspace}
            />
            {workspaceSwitchError ? (
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: "#8b2020",
                }}
                role="alert"
              >
                {workspaceSwitchError}
              </p>
            ) : null}
          </div>
        ) : null}

        {SETTINGS_ITEMS.map((item) => {
          const teammatesDisabled =
            item.href === "/settings/teammates" && workspacePermissionLevel === "reviewer";

          if (teammatesDisabled) {
            return (
              <Tooltip
                key={item.href}
                label="Editor or Admin access required to view teammates."
                position="right"
                fullWidth
              >
                <span style={{ display: "block" }}>
                  <button
                    type="button"
                    aria-disabled
                    disabled
                    style={disabledNavItemStyle()}
                    onClick={(event) => {
                      event.preventDefault();
                    }}
                  >
                    {item.label}
                  </button>
                </span>
              </Tooltip>
            );
          }

          return (
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
          );
        })}
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
          onMouseEnter={() => setHoveredHref("/settings/subscription")}
          onMouseLeave={() => setHoveredHref(null)}
          style={menuItemStyle(
            activePath === "/settings/subscription",
            hoveredHref === "/settings/subscription",
          )}
          onClick={() => navigate("/settings/subscription")}
        >
          Subscription
        </button>

        <button
          type="button"
          onMouseEnter={() => setHoveredHref("/settings")}
          onMouseLeave={() => setHoveredHref(null)}
          style={menuItemStyle(
            activePath === "/settings",
            hoveredHref === "/settings",
          )}
          onClick={() => navigate("/settings")}
        >
          Integrations
        </button>
      </div>

      <div style={footerBlockStyle}>
        <div style={footerIdentityRowStyle}>
          <div style={{ minWidth: 0, flex: "1 1 0" }}>
            <p style={footerNameStyle}>{displayName}</p>
            {roleLabel.trim() ? <p style={footerRoleStyle}>{roleLabel}</p> : null}
          </div>
          <span aria-hidden="true">
            <Avatar
              name={displayName}
              size="lg"
              contributorId={avatarColourKey(contributorEmail, contributorId)}
              style={getAvatarInlineStyle(
                avatarColourKey(contributorEmail, contributorId),
                { ring: true },
              )}
            />
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
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-primary, #2e1c1c)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const footerRoleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 400,
  color: "var(--text-secondary, #6b5e55)",
};

function disabledNavItemStyle(): CSSProperties {
  return {
    width: "100%",
    height: 37,
    boxSizing: "border-box",
    border: "none",
    textAlign: "left",
    padding: "8px 12px",
    background: "transparent",
    color: "var(--text-disabled)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "default",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  };
}

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
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "default" : "pointer",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    opacity: disabled ? 0.55 : 1,
  };
}
