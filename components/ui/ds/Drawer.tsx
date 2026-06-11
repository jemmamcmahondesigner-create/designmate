'use client';

import { useEffect, useRef, type CSSProperties, type Ref } from 'react';
import { Icon } from './Icon';
import styles from './Drawer.module.css';

export type DrawerType = 'detail' | 'edit' | 'create' | 'filter';
export type DrawerWidth = 360 | 480 | 600;

export interface DrawerProps {
  open: boolean;
  type?: DrawerType;
  width?: DrawerWidth;
  title?: string;
  subtitle?: string;
  /** When false, the subtitle line is omitted entirely. Default true. */
  showSubtitle?: boolean;
  onClose: () => void;
  /** When false, scrim clicks do not close the drawer. Default true. */
  scrimClosable?: boolean;
  /** Scrim appearance — `brand` uses the burgundy overlay per project edit spec. */
  scrimVariant?: 'default' | 'brand';
  /** When `scrimClosable` is false and the user presses Escape, invoke this instead of closing. */
  onEscapeWhenScrimBlocked?: () => void;
  /** Optional ref on the scrollable body region */
  bodyRef?: Ref<HTMLDivElement>;
  /** Body content — form fields, detail sections, etc. */
  children?: React.ReactNode;
  /** Footer actions — rendered automatically for edit/create/filter types.
   *  Pass null to suppress the default footer and render your own via children. */
  footer?: React.ReactNode;
  /** Merged onto the sticky footer wrapper (e.g. scroll-linked shadow). */
  footerStyle?: CSSProperties;
  className?: string;
}

const DEFAULT_TITLES: Record<DrawerType, string> = {
  detail: 'Review details',
  edit: 'Edit review',
  create: 'New review',
  filter: 'Filter reviews',
};

const DEFAULT_SUBTITLES: Record<DrawerType, string> = {
  detail: 'Optional subtitle or supporting context',
  edit: 'Update review fields and context',
  create: 'Define problem, attach artifact',
  filter: 'Apply filters to the review list',
};

export function Drawer({
  open,
  type = 'detail',
  width = 360,
  title,
  subtitle,
  showSubtitle = true,
  onClose,
  scrimClosable = true,
  scrimVariant = 'default',
  onEscapeWhenScrimBlocked,
  bodyRef,
  children,
  footer,
  footerStyle,
  className,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Escape key closes drawer (respect scrim guard: same as scrim click policy)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (scrimClosable) onClose();
      else onEscapeWhenScrimBlocked?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, scrimClosable, onEscapeWhenScrimBlocked]);

  // Focus trap: focus first focusable element on open
  useEffect(() => {
    if (!open || !drawerRef.current) return;
    const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();
  }, [open]);

  if (!open) return null;

  const resolvedTitle = title ?? DEFAULT_TITLES[type];
  const resolvedSubtitle = subtitle ?? DEFAULT_SUBTITLES[type];
  const hasFooter = type !== 'detail';

  const rootClass = [
    styles.root,
    styles[`width-${width}`],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const scrimClass = [
    styles.scrim,
    scrimVariant === 'brand' ? styles.scrimBrand : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* Scrim — click to close */}
      <div
        className={scrimClass}
        onClick={scrimClosable ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        ref={drawerRef}
        className={rootClass}
        role="dialog"
        aria-modal="true"
        aria-label={resolvedTitle}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.title}>{resolvedTitle}</p>
            {showSubtitle && resolvedSubtitle ? (
              <p className={styles.subtitle}>{resolvedSubtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close drawer"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className={styles.divider} />

        {/* Body */}
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>

        {/* Footer */}
        {hasFooter && footer !== null && (
          <>
            {type === 'filter' && <div className={styles.footerDivider} />}
            <div className={styles.footer} style={footerStyle}>
              {footer !== undefined ? (
                footer
              ) : (
                <>
                  <div className={styles.footerSpacer} />
                  <DefaultFooter type={type} onClose={onClose} />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function DefaultFooter({ type, onClose }: { type: DrawerType; onClose: () => void }) {
  if (type === 'filter') {
    return (
      <>
        <button type="button" className={styles.btnSecondary} onClick={onClose}>
          Clear all
        </button>
        <button type="submit" className={styles.btnPrimary}>
          Apply filters
        </button>
      </>
    );
  }
  return (
    <>
      <button type="button" className={styles.btnSecondary} onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className={styles.btnAccent}>
        {type === 'create' ? 'Create' : 'Save'}
      </button>
    </>
  );
}
