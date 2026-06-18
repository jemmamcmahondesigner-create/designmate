'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { FilterPanel } from './FilterPanel';
import { Icon, type IconName } from './Icon';
import { getAvatarInlineStyle, avatarColourKey } from '@/lib/utils/avatarColour';
import styles from './Menu.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
//
// DLS Menu has four types:
//   dropdown     — icon + label, no footer
//   context-menu — icon + label, `active` renders a right-hand check
//   action-menu  — context-menu body + destructive (delete) footer
//   multi-select — avatar + checkbox + label items, optional link-style footer
//
// Footer is declared declaratively via `footerAction` on the Menu.

export type MenuType =
  | 'dropdown'
  | 'context-menu'
  | 'action-menu'
  | 'multi-select'
  | 'sections';
export type MenuFooterType = 'link' | 'delete' | 'button';

export interface MenuSectionsState {
  tags: {
    all: boolean;
    feedback: boolean;
    changeRequests: boolean;
    replies: boolean;
    notifications: boolean;
  };
  people: {
    all: boolean;
    reviewerIds: string[];
  };
}

export interface MenuSectionsReviewer {
  id: string;
  name: string;
  initials: string;
}

export interface MenuFooterProps {
  type: MenuFooterType;
  /** Primary label. For `button` type this is the Done-style confirm label. */
  label: string;
  /** Optional override; defaults to "plus" for link / "trash" for delete / "plus" for button additional link */
  icon?: IconName;
  onClick?: () => void;
  /** `button` only — label for the secondary "+ Link" control (default "Link") */
  additionalLinkLabel?: string;
  /** `button` only — click handler for the secondary "+ Link" control */
  onAdditionalLink?: () => void;
  /** `button` only — whether to show the secondary link (default true) */
  showAdditionalLink?: boolean;
}

export interface MenuItemProps {
  label: string;
  /** Leading icon (default "icon" variant) */
  icon?: IconName;
  /** Avatar variant — when provided, renders in place of the icon */
  avatarSrc?: string;
  avatarName?: string;
  /** Contributor UUID for deterministic avatar colour in multi-select menus. */
  avatarContributorId?: string;
  avatarContributorEmail?: string | null;
  /** Render a leading checkbox (multi-select pattern) */
  checkbox?: boolean;
  /** Active / selected — blush bg, brand text, trailing check */
  active?: boolean;
  /** Destructive styling for the item row (red text) */
  destructive?: boolean;
  /** Optional styles for the label span (e.g. lifecycle / status tone colours). */
  labelStyle?: CSSProperties;
  onClick?: () => void;
  disabled?: boolean;
}

// ─── MenuItem ────────────────────────────────────────────────────────────────

export function MenuItem({
  label,
  icon,
  avatarSrc,
  avatarName,
  avatarContributorId,
  avatarContributorEmail,
  checkbox = false,
  active = false,
  destructive = false,
  labelStyle,
  onClick,
  disabled = false,
}: MenuItemProps) {
  const iconColor = destructive ? '#8b2020' : active ? '#6b1e2e' : '#6b5e55';

  const itemClass = [
    styles.item,
    active ? styles.itemActive : '',
    destructive ? styles.itemDestructive : '',
    disabled ? styles.itemDisabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  const hasAvatar = Boolean(avatarSrc || avatarName);

  return (
    <li
      role="menuitem"
      aria-checked={checkbox ? active : undefined}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={itemClass}
      onClick={() => !disabled && onClick?.()}
      onKeyDown={(e: KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {checkbox && (
        <span
          className={[styles.checkbox, active ? styles.checkboxChecked : '']
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        >
          {active && <Icon name="check" size={12} />}
        </span>
      )}

      {hasAvatar ? (
        <span className={styles.itemAvatar} aria-hidden="true">
          <Avatar
            src={avatarSrc}
            name={avatarName ?? label}
            contributorId={avatarContributorId}
            size="md"
            style={
              avatarContributorId || avatarContributorEmail
                ? getAvatarInlineStyle(
                    avatarColourKey(avatarContributorEmail, avatarContributorId),
                    { ring: true },
                  )
                : undefined
            }
          />
        </span>
      ) : icon ? (
        <span
          className={styles.itemIcon}
          aria-hidden="true"
          style={{ color: iconColor }}
        >
          <Icon name={icon} size={16} />
        </span>
      ) : null}

      <span className={styles.itemLabel} style={labelStyle}>
        {label}
      </span>

      {active && !checkbox && (
        <span
          className={styles.itemCheck}
          aria-hidden="true"
          style={{ color: '#6b1e2e' }}
        >
          <Icon name="check" size={16} />
        </span>
      )}
    </li>
  );
}

/** Section label for grouped menu lists (matches FilterPanel / sections menu headers). */
export function MenuSectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className={styles.sectionsHeadingWrap} role="presentation">
      <span className={styles.sectionsHeading}>{children}</span>
    </div>
  );
}

// ─── MenuFooter ──────────────────────────────────────────────────────────────
// Named export so callers can compose a custom footer too.

export function MenuFooter({
  type,
  label,
  icon,
  onClick,
  additionalLinkLabel = 'Link',
  onAdditionalLink,
  showAdditionalLink = true,
}: MenuFooterProps) {
  // ─── `button` variant — confirm Done + optional "+ Link" ───────────────────
  if (type === 'button') {
    return (
      <div className={styles.footerButton}>
        <button
          type="button"
          className={styles.footerDoneBtn}
          onClick={() => onClick?.()}
        >
          {label}
        </button>
        {showAdditionalLink && (
          <button
            type="button"
            className={styles.footerAdditionalLink}
            onClick={() => onAdditionalLink?.()}
          >
            <span className={styles.footerIcon} aria-hidden="true">
              <Icon name={icon ?? 'plus'} size={14} />
            </span>
            <span>{additionalLinkLabel}</span>
          </button>
        )}
      </div>
    );
  }

  // ─── `link` / `delete` variants ────────────────────────────────────────────
  const resolvedIcon: IconName = icon ?? (type === 'delete' ? 'trash' : 'plus');
  const isDelete = type === 'delete';

  return (
    <div
      className={[
        styles.footer,
        isDelete ? styles.footerDelete : styles.footerLink,
      ].join(' ')}
    >
      <button
        type="button"
        className={styles.footerBtn}
        onClick={() => onClick?.()}
      >
        <span className={styles.footerIcon} aria-hidden="true">
          <Icon name={resolvedIcon} size={16} />
        </span>
        <span className={styles.footerLabel}>{label}</span>
      </button>
    </div>
  );
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  type?: MenuType;
  /** Ref of the triggering element — excluded from outside-click detection */
  anchorRef?: RefObject<HTMLElement>;
  /** Menu alignment relative to its nearest positioned ancestor */
  align?: 'left' | 'right';
  /** Render to `document.body` with fixed positioning (avoids overflow clipping, e.g. tables) */
  portal?: boolean;
  /** z-index when `portal` is true (default 100) */
  portalZIndex?: number;
  /** Optional id for the menu list element (aria-controls target) */
  id?: string;
  /** Declarative footer — pass `{ type, label, onClick }` */
  footerAction?: MenuFooterProps;
  /** Custom footer slot rendered below the scrollable list (outside `ul`) */
  footerSlot?: ReactNode;
  sections?: MenuSectionsState;
  reviewers?: MenuSectionsReviewer[];
  onApply?: (filters: MenuSectionsState) => void;
  'aria-label'?: string;
  className?: string;
}

export function Menu({
  open,
  onClose,
  children,
  type = 'dropdown',
  anchorRef,
  align = 'right',
  portal = false,
  portalZIndex,
  id,
  footerAction,
  footerSlot,
  sections,
  reviewers = [],
  onApply,
  'aria-label': ariaLabel = 'Menu',
  className,
}: MenuProps) {
  const isSectionsType = type === 'sections';
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});
  const [sectionsOpenUpward, setSectionsOpenUpward] = useState(false);
  const defaultTags = {
    all: true,
    feedback: false,
    changeRequests: false,
    replies: false,
    notifications: false,
  } as const;

  const defaultPeople = { all: true, reviewerIds: [] as string[] };

  const [draftSections, setDraftSections] = useState<MenuSectionsState>({
    tags: { ...defaultTags },
    people: { ...defaultPeople },
  });
  const defaultSections = useMemo<MenuSectionsState>(
    () => ({
      tags: { ...defaultTags },
      people: { ...defaultPeople },
    }),
    []
  );

  // Close on outside click (skip clicks on the anchor itself so it can toggle)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (anchorRef?.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open || type !== 'sections') return;
    const viewportHalf = window.innerHeight / 2;
    const anchorTop = anchorRef?.current?.getBoundingClientRect().top ?? 0;
    setSectionsOpenUpward(anchorTop > viewportHalf);
  }, [open, type, anchorRef]);

  useEffect(() => {
    if (!open || type !== 'sections') return;
    const base = sections ?? defaultSections;
    setDraftSections({
      tags: { ...defaultTags, ...base.tags },
      people: { ...defaultPeople, ...base.people },
    });
  }, [open, type, sections, defaultSections]);

  // Escape closes; Arrow up/down moves focus within the list
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = Array.from(
          listRef.current?.querySelectorAll<HTMLElement>(
            '[role="menuitem"]:not([aria-disabled="true"])'
          ) ?? []
        );
        if (items.length === 0) return;
        const idx = items.indexOf(document.activeElement as HTMLElement);
        const next =
          e.key === 'ArrowDown'
            ? items[Math.min(idx + 1, items.length - 1)]
            : items[Math.max(idx - 1, 0)];
        next?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Auto-focus first enabled item on open
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const first = listRef.current?.querySelector<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])'
      );
      first?.focus();
    }, 10);
    return () => clearTimeout(t);
  }, [open]);

  const updatePortalPosition = useCallback(() => {
    if (!open || !portal || isSectionsType) return;
    const el = anchorRef?.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const pad = 12;
    const h = menuRef.current?.offsetHeight ?? 140;
    const below = window.innerHeight - rect.bottom - gap - pad;
    const above = rect.top - gap - pad;
    const openUp = below < h && above > below;
    const z = portalZIndex ?? 100;
    const next: CSSProperties = {
      position: 'fixed',
      zIndex: z,
      minWidth: 240,
    };
    if (align === 'left') {
      next.left = Math.max(pad, rect.left);
      if (openUp) {
        next.bottom = window.innerHeight - rect.top + gap;
        next.top = 'auto';
      } else {
        next.top = rect.bottom + gap;
        next.bottom = 'auto';
      }
    } else {
      next.right = Math.max(pad, window.innerWidth - rect.right);
      if (openUp) {
        next.bottom = window.innerHeight - rect.top + gap;
        next.top = 'auto';
      } else {
        next.top = rect.bottom + gap;
        next.bottom = 'auto';
      }
    }
    setPortalStyle(next);
  }, [open, portal, isSectionsType, align, portalZIndex, anchorRef]);

  useLayoutEffect(() => {
    if (!open || !portal || isSectionsType) return;
    updatePortalPosition();
    const raf = requestAnimationFrame(() => updatePortalPosition());
    const el = menuRef.current;
    const ro =
      typeof ResizeObserver !== 'undefined' && el
        ? new ResizeObserver(() => updatePortalPosition())
        : null;
    if (el) ro?.observe(el);
    window.addEventListener('scroll', updatePortalPosition, true);
    window.addEventListener('resize', updatePortalPosition);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('scroll', updatePortalPosition, true);
      window.removeEventListener('resize', updatePortalPosition);
    };
  }, [open, portal, isSectionsType, updatePortalPosition, children, footerAction, footerSlot]);

  if (!open) return null;

  const usePortalLayout = portal && !isSectionsType;

  const rootClassResolved = [
    styles.menu,
    !usePortalLayout && align === 'right' ? styles.alignRight : '',
    !usePortalLayout && align === 'left' ? styles.alignLeft : '',
    usePortalLayout ? styles.menuPortal : '',
    type === 'multi-select' ? styles.multiSelect : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const sectionsAnchorClass = [styles.sectionsMenuAnchor, className ?? '']
    .filter(Boolean)
    .join(' ');

  const hasChildren = Boolean(
    children && (!Array.isArray(children) || children.some((c) => c != null && c !== false))
  );
  const tagKeys = ['feedback', 'changeRequests', 'replies', 'notifications'] as const;
  const selectedReviewerIds = draftSections.people.reviewerIds;
  const selectedTagCount = tagKeys.filter((key) => draftSections.tags[key]).length;
  const selectedPeopleCount = selectedReviewerIds.length;
  const tagsAllChecked = draftSections.tags.all;
  const peopleAllChecked = draftSections.people.all;
  const tagsIndeterminate =
    !draftSections.tags.all &&
    selectedTagCount > 0 &&
    selectedTagCount < tagKeys.length;
  const peopleIndeterminate =
    reviewers.length > 0 &&
    !draftSections.people.all &&
    selectedPeopleCount > 0 &&
    selectedPeopleCount < reviewers.length;
  const appliedSections = sections ?? defaultSections;
  const normalizedDraft: MenuSectionsState = {
    tags: { ...defaultTags, ...draftSections.tags },
    people: { ...defaultPeople, ...draftSections.people },
  };
  const normalizedApplied: MenuSectionsState = {
    tags: { ...defaultTags, ...appliedSections.tags },
    people: { ...defaultPeople, ...appliedSections.people },
  };
  const isApplyEnabled =
    JSON.stringify(normalizedDraft) !== JSON.stringify(normalizedApplied);

  const isSectionsAtDefault =
    JSON.stringify(normalizedDraft.tags) === JSON.stringify(defaultTags) &&
    JSON.stringify(normalizedDraft.people) === JSON.stringify(defaultPeople);

  function resetSectionsToDefault() {
    setDraftSections({
      tags: { ...defaultTags },
      people: { ...defaultPeople },
    });
  }

  function setTagsAll(checked: boolean) {
    setDraftSections((prev) => {
      if (checked) {
        return {
          ...prev,
          tags: {
            all: true,
            feedback: false,
            changeRequests: false,
            replies: false,
            notifications: false,
          },
        };
      }
      return {
        ...prev,
        tags: {
          all: false,
          feedback: false,
          changeRequests: false,
          replies: false,
          notifications: false,
        },
      };
    });
  }

  function setIndividualTag(
    key: 'feedback' | 'changeRequests' | 'replies' | 'notifications',
    checked: boolean
  ) {
    setDraftSections((prev) => {
      if (prev.tags.all) {
        if (checked) {
          return {
            ...prev,
            tags: {
              all: false,
              feedback: key === 'feedback',
              changeRequests: key === 'changeRequests',
              replies: key === 'replies',
              notifications: key === 'notifications',
            },
          };
        }
        const nextSelections = {
          feedback: key !== 'feedback',
          changeRequests: key !== 'changeRequests',
          replies: key !== 'replies',
          notifications: key !== 'notifications',
        };
        const nextSelectedCount = tagKeys.filter((tagKey) => nextSelections[tagKey]).length;
        if (nextSelectedCount === tagKeys.length) {
          return {
            ...prev,
            tags: {
              all: true,
              feedback: false,
              changeRequests: false,
              replies: false,
              notifications: false,
            },
          };
        }
        return {
          ...prev,
          tags: {
            all: false,
            feedback: nextSelections.feedback,
            changeRequests: nextSelections.changeRequests,
            replies: nextSelections.replies,
            notifications: nextSelections.notifications,
          },
        };
      }

      const nextSelections = {
        feedback: prev.tags.feedback,
        changeRequests: prev.tags.changeRequests,
        replies: prev.tags.replies,
        notifications: prev.tags.notifications,
        [key]: checked,
      };
      const nextSelectedCount = tagKeys.filter((tagKey) => nextSelections[tagKey]).length;
      if (nextSelectedCount === tagKeys.length) {
        return {
          ...prev,
          tags: {
            all: true,
            feedback: false,
            changeRequests: false,
            replies: false,
            notifications: false,
          },
        };
      }
      return {
        ...prev,
        tags: {
          all: false,
          feedback: nextSelections.feedback,
          changeRequests: nextSelections.changeRequests,
          replies: nextSelections.replies,
          notifications: nextSelections.notifications,
        },
      };
    });
  }

  function setPeopleAll(checked: boolean) {
    setDraftSections((prev) => {
      if (checked) {
        return {
          ...prev,
          people: { all: true, reviewerIds: [] },
        };
      }
      return {
        ...prev,
        people: { all: false, reviewerIds: [] },
      };
    });
  }

  const floatingStyle: CSSProperties | undefined = isSectionsType
    ? {
        top: sectionsOpenUpward ? 'auto' : 'calc(100% + 4px)',
        bottom: sectionsOpenUpward ? 'calc(100% + 4px)' : 'auto',
      }
    : usePortalLayout
      ? portalStyle
      : undefined;

  const filterPanelGroups = isSectionsType
    ? [
        {
          id: 'tags',
          heading: 'TAGS',
          allRow: {
            id: 'tags-all',
            checked: tagsAllChecked,
            indeterminate: tagsIndeterminate,
            onChange: setTagsAll,
          },
          items: [
            {
              id: 'tags-feedback',
              label: 'Feedback',
              checked: !draftSections.tags.all && draftSections.tags.feedback,
              onChange: (checked: boolean) => setIndividualTag('feedback', checked),
            },
            {
              id: 'tags-change-requests',
              label: 'Change Requests',
              checked: !draftSections.tags.all && draftSections.tags.changeRequests,
              onChange: (checked: boolean) => setIndividualTag('changeRequests', checked),
            },
            {
              id: 'tags-replies',
              label: 'Replies',
              checked: !draftSections.tags.all && draftSections.tags.replies,
              onChange: (checked: boolean) => setIndividualTag('replies', checked),
            },
            {
              id: 'tags-notifications',
              label: 'Notifications',
              checked: !draftSections.tags.all && draftSections.tags.notifications,
              onChange: (checked: boolean) => setIndividualTag('notifications', checked),
            },
          ],
        },
        {
          id: 'people',
          heading: 'PEOPLE',
          allRow: {
            id: 'people-all',
            checked: peopleAllChecked,
            indeterminate: peopleIndeterminate,
            onChange: setPeopleAll,
          },
          people: reviewers.map((reviewer) => ({
            id: reviewer.id,
            name: reviewer.name,
            initials: reviewer.initials,
            checked:
              !draftSections.people.all && selectedReviewerIds.includes(reviewer.id),
            onChange: (checked: boolean) =>
              setDraftSections((prev) => {
                const allReviewerIds = reviewers.map((item) => item.id);
                if (prev.people.all) {
                  if (checked) {
                    return {
                      ...prev,
                      people: { all: false, reviewerIds: [reviewer.id] },
                    };
                  }
                  const nextIds = allReviewerIds.filter((idValue) => idValue !== reviewer.id);
                  if (nextIds.length === reviewers.length) {
                    return {
                      ...prev,
                      people: { all: true, reviewerIds: [] },
                    };
                  }
                  return {
                    ...prev,
                    people: { all: false, reviewerIds: nextIds },
                  };
                }
                const nextIds = checked
                  ? Array.from(new Set([...prev.people.reviewerIds, reviewer.id]))
                  : prev.people.reviewerIds.filter((idValue) => idValue !== reviewer.id);
                if (nextIds.length === reviewers.length) {
                  return {
                    ...prev,
                    people: { all: true, reviewerIds: [] },
                  };
                }
                return {
                  ...prev,
                  people: {
                    all: false,
                    reviewerIds: nextIds,
                  },
                };
              }),
          })),
        },
      ]
    : [];

  const menuTree = (
    <div
      ref={menuRef}
      id={id}
      className={isSectionsType ? sectionsAnchorClass : rootClassResolved}
      style={floatingStyle}
    >
      {isSectionsType ? (
        <FilterPanel
          idPrefix={id ?? 'menu'}
          groups={filterPanelGroups}
          resetDisabled={isSectionsAtDefault}
          onReset={resetSectionsToDefault}
          applyDisabled={!isApplyEnabled}
          onApply={() => {
            onApply?.(draftSections);
            onClose();
          }}
          style={{ width: 229, minWidth: 229 }}
        />
      ) : (
        <>
          {hasChildren && (
            <ul
              ref={listRef}
              role="menu"
              aria-label={ariaLabel}
              className={styles.list}
            >
              {children}
            </ul>
          )}

          {footerSlot}
          {footerAction && <MenuFooter {...footerAction} />}
        </>
      )}
    </div>
  );

  return usePortalLayout ? createPortal(menuTree, document.body) : menuTree;
}
