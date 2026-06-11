'use client';

import type { LegacyRef, ReactNode } from 'react';
import { Avatar } from './Avatar';
import { ButtonGroup } from './ButtonGroup';
import { StatusPill, StatusPillStatus } from './StatusPill';
import { TabItem } from './TabItem';
import { Icon, type IconName } from './Icon';
import { IconSquareButton } from './IconSquareButton';
import { Breadcrumb } from './Breadcrumb';
import styles from './PageHeader.module.css';

export type PageHeaderVariant =
  | 'default'
  | 'detail'
  | 'breadcrumb-tabs'
  | 'breadcrumbs'
  | 'search';

export interface PageHeaderTab {
  label: string;
  badgeCount?: number;
}

export interface PageHeaderBreadcrumbSegment {
  label: string;
  /** If set, the segment renders as a next/link. The last segment should omit href. */
  href?: string;
}

export interface PageHeaderProps {
  variant?: PageHeaderVariant;
  pageTitle?: string;
  /** Plain-text breadcrumb (legacy). Prefer `breadcrumbSegments` for navigable links. */
  breadcrumb?: string;
  /** Structured breadcrumb — each segment with an `href` becomes a next/link. */
  breadcrumbSegments?: PageHeaderBreadcrumbSegment[];
  /** Project/review status shown in the title row */
  status?: StatusPillStatus;
  statusLabel?: string;
  showStatus?: boolean;
  /** When set, opens the status menu (lg + interactive StatusPill only) */
  onStatusPillClick?: () => void;
  /** Replaces the default StatusPill when you need a custom menu anchor (e.g. project lifecycle) */
  statusSlot?: ReactNode;
  /** Tab bar — used in breadcrumb-tabs variant */
  tabs?: PageHeaderTab[];
  activeTab?: number;
  onTabChange?: (index: number) => void;
  /** Primary CTA label (default: "Review"; shown with leading plus icon in the split button) */
  primaryAction?: string;
  onPrimaryAction?: () => void;
  onPrimaryActionMenu?: () => void;
  onKebab?: () => void;
  onSearch?: (value: string) => void;
  /** When set, the search field is controlled (required for live filter + clear). */
  searchValue?: string;
  searchPlaceholder?: string;
  /** Dropdown under the split-button chevron (positioned by PageHeader) */
  primaryActionMenu?: ReactNode;
  /** Dropdown under the kebab button */
  kebabMenu?: ReactNode;
  /** For aria-expanded on the primary chevron */
  primaryActionMenuExpanded?: boolean;
  /** For aria-expanded on kebab */
  kebabMenuExpanded?: boolean;
  /** Ref to the kebab control wrapper (button + menu) for click-outside detection */
  kebabSectionRef?: LegacyRef<HTMLDivElement>;
  /** Ref to the primary split-button group (for click-outside detection) */
  primaryActionSectionRef?: LegacyRef<HTMLDivElement>;
  /** When set, replaces the default ButtonGroup + primaryActionMenu */
  primaryActionSlot?: ReactNode;
  /** Search variant: user avatar (right side) */
  searchUser?: { name: string; avatarSrc?: string };
  onSearchShare?: () => void;
  onSearchSettings?: () => void;
  /**
   * Search variant: show share, settings, and avatar. Default false — those live in the sidebar only.
   */
  searchShowExtras?: boolean;
  className?: string;
}

export function PageHeader({
  variant = 'default',
  pageTitle = 'Website Redesign',
  breadcrumb = 'Projects  /  Gem Designs & Signs',
  status = 'approved',
  statusLabel = 'Active',
  showStatus = true,
  onStatusPillClick,
  statusSlot,
  breadcrumbSegments,
  tabs = [],
  activeTab = 0,
  onTabChange,
  primaryAction = 'Review',
  onPrimaryAction,
  onPrimaryActionMenu,
  onKebab,
  onSearch,
  searchValue,
  searchPlaceholder = 'Filter by project, group, or team member ...',
  primaryActionMenu,
  kebabMenu,
  primaryActionMenuExpanded,
  kebabMenuExpanded,
  kebabSectionRef,
  primaryActionSectionRef,
  primaryActionSlot,
  searchUser,
  onSearchShare,
  onSearchSettings,
  searchShowExtras = false,
  className,
}: PageHeaderProps) {
  const isBreadcrumbVariant =
    variant === 'breadcrumb-tabs' || variant === 'breadcrumbs';

  const resolvedPrimaryLeadingIcon: IconName | undefined =
    primaryActionSlot == null &&
    (primaryAction === 'Review' || primaryAction === '+ Review')
      ? 'plus'
      : undefined;

  const breadcrumbsSlimBar =
    variant === 'breadcrumbs' && !(pageTitle ?? '').trim();

  const rootClass = [
    styles.root,
    breadcrumbsSlimBar ? styles.slim : isBreadcrumbVariant ? styles.tall : styles.slim,
    breadcrumbsSlimBar ? styles.rootBreadcrumbsSlim : '',
    variant === 'breadcrumb-tabs' ? styles.rootBreadcrumbTabs : '',
    variant === 'search' ? styles.rootSearch : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={rootClass}>
      {/* ── Slim variants: default, detail ── */}
      {(variant === 'default' || variant === 'detail') && (
        <div className={styles.slimInner}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{pageTitle}</h1>
            {showStatus && variant === 'detail' && (
              statusSlot ?? (
                <StatusPill
                  label={statusLabel}
                  status={status}
                  size="lg"
                  state={onStatusPillClick ? 'interactive' : 'default'}
                  onClick={onStatusPillClick}
                />
              )
            )}
          </div>
          <ActionBar
            primaryAction={primaryAction}
            primaryLeadingIcon={resolvedPrimaryLeadingIcon}
            onPrimaryAction={onPrimaryAction}
            onPrimaryActionMenu={onPrimaryActionMenu}
            onKebab={onKebab}
            variant={variant}
            primaryActionMenu={primaryActionMenu}
            kebabMenu={kebabMenu}
            primaryActionMenuExpanded={primaryActionMenuExpanded}
            kebabMenuExpanded={kebabMenuExpanded}
            kebabSectionRef={kebabSectionRef}
            primaryActionSectionRef={primaryActionSectionRef}
            primaryActionSlot={primaryActionSlot}
          />
        </div>
      )}

      {/* ── Search variant ── */}
      {variant === 'search' && (
        <div
          className={[styles.slimInner, styles.slimInnerSearch].filter(Boolean).join(' ')}
        >
          <div className={styles.searchField}>
            <Icon name="search" size={16} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              type="text"
              placeholder={searchPlaceholder}
              {...(searchValue !== undefined ? { value: searchValue } : {})}
              onChange={(e) => onSearch?.(e.target.value)}
              aria-label="Search"
            />
          </div>
          <div className={styles.actions}>
            <div className={styles.actionButtons}>
              <div
                ref={primaryActionSectionRef}
                style={{ position: 'relative', display: 'inline-flex' }}
              >
                {primaryActionSlot ?? (
                  <>
                    <ButtonGroup
                      label={primaryAction}
                      primaryLeadingIcon={resolvedPrimaryLeadingIcon}
                      variant="primary"
                      size="sm"
                      onPrimaryClick={onPrimaryAction}
                      onMenuClick={onPrimaryActionMenu}
                      menuAriaLabel="More actions"
                      menuExpanded={primaryActionMenuExpanded}
                    />
                    {primaryActionMenu}
                  </>
                )}
              </div>
              {searchShowExtras ? (
                <>
                  <button
                    type="button"
                    className={styles.btnIcon}
                    aria-label="Share"
                    onClick={onSearchShare}
                  >
                    <Icon name="share" size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.btnIcon}
                    aria-label="Settings"
                    onClick={onSearchSettings}
                  >
                    <Icon name="nav-settings" size={14} />
                  </button>
                </>
              ) : null}
            </div>
            {searchShowExtras && searchUser ? (
              <Avatar
                src={searchUser.avatarSrc}
                name={searchUser.name}
                size="lg"
              />
            ) : null}
          </div>
        </div>
      )}

      {/* ── Breadcrumb variants ── */}
      {isBreadcrumbVariant && (
        <>
          <div className={styles.breadcrumbTop}>
            <div className={styles.breadcrumbLeft}>
              <Breadcrumb
                segments={breadcrumbSegments}
                fallback={breadcrumb}
                className={styles.breadcrumb}
              />
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{pageTitle}</h1>
                {showStatus && (
                  statusSlot ?? (
                    <StatusPill
                      label={statusLabel}
                      status={status}
                      size="lg"
                      state={onStatusPillClick ? 'interactive' : 'default'}
                      onClick={onStatusPillClick}
                    />
                  )
                )}
              </div>
            </div>
            <ActionBar
              primaryAction={primaryAction}
              primaryLeadingIcon={resolvedPrimaryLeadingIcon}
              onPrimaryAction={onPrimaryAction}
              onPrimaryActionMenu={onPrimaryActionMenu}
              onKebab={onKebab}
              variant={variant}
              primaryActionMenu={primaryActionMenu}
              kebabMenu={kebabMenu}
              primaryActionMenuExpanded={primaryActionMenuExpanded}
              kebabMenuExpanded={kebabMenuExpanded}
              kebabSectionRef={kebabSectionRef}
              primaryActionSectionRef={primaryActionSectionRef}
              primaryActionSlot={primaryActionSlot}
            />
          </div>
          <div className={styles.breadcrumbDivider} />
        </>
      )}

      {/* ── Tab bar (breadcrumb-tabs only) ── */}
      {variant === 'breadcrumb-tabs' && tabs.length > 0 && (
        <div className={styles.tabBar}>
          <div className={styles.tabs} role="tablist" aria-label="Page sections">
            {tabs.map((tab, i) => (
              <TabItem
                key={tab.label}
                label={tab.label}
                active={i === activeTab}
                style="pill"
                showBadge={!!tab.badgeCount}
                badgeCount={tab.badgeCount}
                onClick={() => onTabChange?.(i)}
              />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

/* ── Shared action bar ─────────────────────────────────────────────────────── */

interface ActionBarProps {
  primaryAction: string;
  primaryLeadingIcon?: IconName;
  onPrimaryAction?: () => void;
  onPrimaryActionMenu?: () => void;
  onKebab?: () => void;
  variant: PageHeaderVariant;
  primaryActionMenu?: ReactNode;
  kebabMenu?: ReactNode;
  primaryActionMenuExpanded?: boolean;
  kebabMenuExpanded?: boolean;
  kebabSectionRef?: LegacyRef<HTMLDivElement>;
  primaryActionSectionRef?: LegacyRef<HTMLDivElement>;
  primaryActionSlot?: ReactNode;
}

function ActionBar({
  primaryAction,
  primaryLeadingIcon,
  onPrimaryAction,
  onPrimaryActionMenu,
  onKebab,
  variant,
  primaryActionMenu,
  kebabMenu,
  primaryActionMenuExpanded,
  kebabMenuExpanded,
  kebabSectionRef,
  primaryActionSectionRef,
  primaryActionSlot,
}: ActionBarProps) {
  return (
    <div className={styles.actions}>
      {/* Split button group or custom slot */}
      <div
        ref={primaryActionSectionRef}
        style={{ position: 'relative', display: 'inline-flex' }}
      >
        {primaryActionSlot !== undefined ? (
          primaryActionSlot
        ) : (
          <>
            <ButtonGroup
              label={primaryAction}
              primaryLeadingIcon={primaryLeadingIcon}
              variant="primary"
              size="sm"
              onPrimaryClick={onPrimaryAction}
              onMenuClick={onPrimaryActionMenu}
              menuAriaLabel="More actions"
              menuExpanded={primaryActionMenuExpanded}
            />
            {primaryActionMenu}
          </>
        )}
      </div>

      {/* Kebab / overflow */}
      {(variant === 'detail' || variant === 'breadcrumb-tabs' || variant === 'breadcrumbs') &&
        onKebab && (
        <div ref={kebabSectionRef} style={{ position: 'relative' }}>
          <IconSquareButton
            icon="kebab"
            label="More options"
            onClick={onKebab}
            aria-haspopup="menu"
            aria-expanded={kebabMenuExpanded ?? false}
          />
          {kebabMenu}
        </div>
      )}
    </div>
  );
}
