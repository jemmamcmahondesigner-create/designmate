'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { useLayoutEffect, useState } from 'react';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Tooltip } from './Tooltip';
import styles from './Sidebar.module.css';

export interface SidebarProject {
  id: string;
  name: string;
  clientName: string;
  hasActivity?: boolean;
  active?: boolean;
}

export interface SidebarProps {
  /** @deprecated Active state is derived from pathname. */
  activeNav?: 'projects' | 'reviews' | 'settings';
  projects?: SidebarProject[];
  projectsOpen?: boolean;
  onProjectsToggle?: () => void;
  onShowAll?: () => void;
  onProjectClick?: (id: string) => void;
  onReviewsClick?: () => void;
  user?: { name: string; avatarSrc?: string };
  onUserClick?: () => void;
  /** Highlight footer row (settings route or menu open). */
  userActive?: boolean;
  /** Popover open state for aria-expanded on the footer button. */
  settingsMenuOpen?: boolean;
  onUserAnchorChange?: (el: HTMLElement | null) => void;
  /** Workspace name shown above Projects nav when rail is expanded. */
  workspaceLabel?: string | null;
  /** Shown in the white nav area above the footer divider; hidden when rail collapsed. */
  aboveFooterSlot?: ReactNode;
  footerSlot?: ReactNode;
  maxVisible?: number;
  className?: string;
  style?: CSSProperties;
  /** Fires when hover-expand changes width (56 ↔ 240) for anchored overlays. */
  onRailWidthChange?: (width: number) => void;
}

const RAIL_COLLAPSED = 56;
const RAIL_EXPANDED = 240;

const labelFadeStyle = (expanded: boolean): CSSProperties => ({
  opacity: expanded ? 1 : 0,
  transition: 'opacity 150ms ease',
  whiteSpace: 'nowrap',
  pointerEvents: expanded ? 'auto' : 'none',
});

function navPrimaryRowStyle(isExpanded: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: isExpanded ? 'flex-start' : 'center',
    paddingLeft: isExpanded ? '12px' : '0',
    paddingRight: isExpanded ? 12 : '0',
    gap: isExpanded ? 8 : 0,
    width: '100%',
    height: '48px',
    borderRadius: 4,
    boxSizing: 'border-box',
  };
}

function footerUserRowLayoutStyle(isExpanded: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: isExpanded ? 'flex-start' : 'center',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: isExpanded ? '12px' : '4px',
    paddingRight: isExpanded ? 12 : '4px',
    gap: isExpanded ? 8 : 0,
    height: '48px',
    boxSizing: 'border-box',
  };
}

/** Invisible label slots must not reserve flex space when collapsed, or icons stay off-center. */
function navLabelSlotStyle(isExpanded: boolean): CSSProperties {
  return {
    ...labelFadeStyle(isExpanded),
    flex: isExpanded ? '1 1 0' : '0 0 0',
    minWidth: 0,
    width: isExpanded ? undefined : 0,
    maxWidth: isExpanded ? undefined : 0,
    overflow: 'hidden',
    textAlign: 'left',
  };
}

const LOGO_WORDMARK_DEFAULT = '/assets/logo/wordmark-expanded-default.svg';
const LOGO_WORDMARK_ACTIVE = '/assets/logo/wordmark-expanded-active.svg';
const LOGO_MARK_COLLAPSED = '/assets/logo/mark-collapsed.svg';

export function Sidebar({
  user,
  onUserClick,
  userActive = false,
  settingsMenuOpen = false,
  onUserAnchorChange,
  workspaceLabel,
  aboveFooterSlot,
  footerSlot,
  className,
  style,
  onRailWidthChange,
}: SidebarProps) {
  const pathname = usePathname() ?? '';
  const [hovered, setHovered] = useState(false);
  const isExpanded = hovered || settingsMenuOpen;

  const projectsActive = pathname.startsWith('/projects');
  const reviewsActive = pathname.startsWith('/reviews');
  const settingsRouteActive = pathname.startsWith('/settings');
  const footerHighlight = userActive || settingsRouteActive;

  useLayoutEffect(() => {
    onRailWidthChange?.(isExpanded ? RAIL_EXPANDED : RAIL_COLLAPSED);
  }, [isExpanded, onRailWidthChange]);

  const rootClass = [
    styles.root,
    isExpanded ? styles.rootExpanded : styles.rootCollapsed,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const navStyle: CSSProperties = {
    width: isExpanded ? RAIL_EXPANDED : RAIL_COLLAPSED,
    transition: 'width 200ms ease-in-out',
    flexShrink: 0,
    overflow: 'hidden',
    ...style,
  };

  const brandRouteActive =
    projectsActive || reviewsActive || settingsRouteActive;

  const wrapNavLink = (
    key: string,
    label: string,
    href: string,
    iconName: 'nav-archive' | 'nav-reviews' | 'nav-settings',
    active: boolean
  ) => {
    const inner = (
      <Link
        href={href}
        className={styles.navRowLink}
        data-active={active ? 'true' : undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={label}
        title={isExpanded ? undefined : label}
        style={navPrimaryRowStyle(isExpanded)}
      >
        <span className={styles.navRowIcon}>
          {iconName === 'nav-settings' ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <Icon name={iconName} size={20} />
          )}
        </span>
        <span className={styles.navRowLabelWrap} style={navLabelSlotStyle(isExpanded)}>
          <span className={styles.navRowLabel}>{label}</span>
        </span>
      </Link>
    );

    if (isExpanded) return <div key={key}>{inner}</div>;
    return (
      <div key={key}>
        <Tooltip label={label} position="right" passThroughFocus fullWidth>
          {inner}
        </Tooltip>
      </div>
    );
  };

  return (
    <nav
      className={rootClass}
      style={navStyle}
      aria-label="Main navigation"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`${styles.brandHeader} ${styles.brandDashedSpec}`}
        data-name="Border"
      >
        <div className={styles.brandRow}>
          <div className={styles.brandLogoShell} data-name="Frame">
            <img
              src={brandRouteActive ? LOGO_WORDMARK_ACTIVE : LOGO_WORDMARK_DEFAULT}
              alt="DesignTrace"
              className={[
                styles.brandWordmarkImg,
                isExpanded ? styles.logoVisible : styles.logoHidden,
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                opacity: isExpanded ? 1 : 0,
                pointerEvents: isExpanded ? 'auto' : 'none',
                transition: 'opacity 150ms ease-in-out',
              }}
            />
            <div
              data-name="Mark"
              className={[
                styles.brandMarkWrap,
                isExpanded ? styles.logoHidden : styles.logoVisible,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <img
                src={LOGO_MARK_COLLAPSED}
                alt=""
                className={styles.brandMarkImg}
                style={{
                  width: 18,
                  height: 18,
                  opacity: isExpanded ? 0 : 1,
                  pointerEvents: isExpanded ? 'none' : 'auto',
                  transition: 'opacity 150ms ease-in-out',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className={styles.mainNav}
        style={{
          paddingTop: 4,
          paddingBottom: 8,
          paddingLeft: isExpanded ? 4 : '4px',
          paddingRight: isExpanded ? 4 : '4px',
        }}
      >
        {workspaceLabel?.trim() && isExpanded ? (
          <div
            style={{
              paddingTop: 12,
              paddingLeft: 16,
              paddingBottom: 0,
              paddingRight: 0,
            }}
          >
            <span className={styles.sectionLabel} style={{ fontWeight: 600 }}>
              {workspaceLabel.trim().toUpperCase()}
            </span>
          </div>
        ) : null}
        {wrapNavLink('projects', 'Projects', '/projects', 'nav-archive', projectsActive)}
        {wrapNavLink('reviews', 'All Reviews', '/reviews', 'nav-reviews', reviewsActive)}
        {aboveFooterSlot ? (
          <div
            style={{
              display: isExpanded ? 'block' : 'none',
              width: '100%',
              boxSizing: 'border-box',
              padding: '0 4px 0',
            }}
          >
            {aboveFooterSlot}
          </div>
        ) : null}
      </div>

      <div className={styles.footerDivider} />

      <div className={styles.footerColumn}>
        <div
          style={{
            padding: isExpanded ? '4px 4px 0' : '4px 0 0',
            boxSizing: 'border-box',
            width: '100%',
          }}
        >
          {wrapNavLink(
            'settings',
            'Settings',
            '/settings/teammates',
            'nav-settings',
            settingsRouteActive
          )}
        </div>
        <button
          type="button"
          data-settings-trigger="true"
          className={[
            styles.footerUserRow,
            footerHighlight ? styles.footerUserRowActive : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={footerUserRowLayoutStyle(isExpanded)}
          onClick={onUserClick}
          ref={(el) => onUserAnchorChange?.(el)}
          aria-label="Open settings menu"
          aria-haspopup="menu"
          aria-expanded={settingsMenuOpen}
        >
          <Avatar src={user?.avatarSrc} name={user?.name} size="md" />
          <span className={styles.footerUserNameWrap} style={navLabelSlotStyle(isExpanded)}>
            <span className={styles.footerUserName}>{user?.name ?? 'User'}</span>
          </span>
        </button>
        {footerSlot ? <div className={styles.footerSlot}>{footerSlot}</div> : null}
      </div>
    </nav>
  );
}
