'use client';

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { Icon } from './Icon';
import styles from './Modal.module.css';

export type ModalType = 'default' | 'destructive' | 'form' | 'information';
export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  type?: ModalType;
  size?: ModalSize;
  title?: string;
  subtitle?: string;
  showSubtitle?: boolean;
  /** When false, backdrop clicks do not call `onClose` (e.g. unsaved form guard). Default true. */
  backdropClosable?: boolean;
  /** When `backdropClosable` is false and the user presses Escape, invoke this instead of `onClose`. */
  onEscapeWhenBackdropBlocked?: () => void;
  /** Body content — passed as children for form/information modals */
  children?: React.ReactNode;
  /** Description text for default/destructive — rendered if no children */
  description?: string;
  /** Primary CTA label override */
  confirmLabel?: string;
  /** Called on confirm / primary action */
  onConfirm?: () => void;
  /** Called on cancel / close / dismiss */
  onClose: () => void;
  /** "Learn more" URL for information type */
  learnMoreHref?: string;
  className?: string;
  /** Applied to the dialog panel (e.g. width override). */
  dialogStyle?: CSSProperties;
  /** When set, replaces the default footer (Cancel / primary) */
  footer?: ReactNode;
  /** When true with a custom `footer`, omit footer padding so the slot can full-bleed (apply padding on inner markup). */
  footerNoPadding?: boolean;
  /** Ref to the scrollable body region (e.g. for per-modal scroll styling). */
  bodyRef?: Ref<HTMLDivElement>;
}

const DEFAULT_TITLES: Record<ModalType, string> = {
  default: 'Dialog title',
  destructive: 'Dialog title',
  form: 'Dialog title',
  information: 'Dialog title',
};

const DEFAULT_CONFIRM_LABELS: Record<ModalType, string> = {
  default: 'Confirm',
  destructive: 'Delete',
  form: 'Save',
  information: 'Close',
};

export function Modal({
  open,
  type = 'default',
  size = 'sm',
  title,
  subtitle,
  showSubtitle = false,
  backdropClosable = true,
  onEscapeWhenBackdropBlocked,
  children,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  learnMoreHref,
  className,
  dialogStyle,
  footer,
  footerNoPadding = false,
  bodyRef,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes (or defers when backdrop is guarded)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (backdropClosable) onClose();
      else onEscapeWhenBackdropBlocked?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, backdropClosable, onEscapeWhenBackdropBlocked]);

  // Focus first focusable on open
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();
  }, [open]);

  // Return focus to trigger on close (caller handles this via ref if needed)

  if (!open) return null;

  const resolvedTitle = title ?? DEFAULT_TITLES[type];
  const resolvedConfirm = confirmLabel ?? DEFAULT_CONFIRM_LABELS[type];

  const dialogClass = [
    styles.dialog,
    styles[`size-${size}`],
    type === 'destructive' ? styles.destructiveDialog : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const titleClass = [
    styles.title,
    type === 'destructive' ? styles.titleDestructive : '',
  ]
    .filter(Boolean)
    .join(' ');

  const headerClass = [
    styles.header,
    type === 'destructive' ? styles.headerDestructive : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* Backdrop */}
      <div
        className={styles.backdrop}
        onClick={backdropClosable ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={dialogClass}
        style={dialogStyle}
      >
        {/* Header */}
        <div className={headerClass}>
          <div className={styles.headerText}>
            <h2 id="modal-title" className={titleClass}>
              {resolvedTitle}
            </h2>
            {showSubtitle && subtitle && (
              <p className={styles.subtitle}>{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Body — DS Select dropdowns use a portaled menu; keep this scrollable, not overflow:hidden. */}
        <div ref={bodyRef} className={styles.body}>
          {children ?? (description && (
            <p className={styles.description}>{description}</p>
          ))}
        </div>

        {/* Footer */}
        <div
          className={[
            styles.footer,
            footer !== undefined && footerNoPadding ? styles.footerNoPadding : '',
            footer === undefined ? styles.footerDefaultRule : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {footer !== undefined ? (
            footer
          ) : type === 'information' ? (
            <>
              {learnMoreHref && (
                <a href={learnMoreHref} className={styles.learnMore}>
                  Learn more →
                </a>
              )}
              <div className={styles.spacer} />
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Close
              </button>
            </>
          ) : (
            <>
              <div className={styles.spacer} />
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Cancel
              </button>
              <button
                type={type === 'form' ? 'submit' : 'button'}
                className={
                  type === 'destructive'
                    ? styles.btnDestructive
                    : type === 'form'
                    ? styles.btnAccent
                    : styles.btnPrimary
                }
                onClick={type !== 'form' ? onConfirm : undefined}
              >
                {resolvedConfirm}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
