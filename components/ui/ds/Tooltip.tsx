'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** The tooltip label (primary line) */
  label: string;
  /** Optional supporting text — shown below label when provided */
  supportingText?: string;
  /**
   * Portal placement. `top` / `bottom` pick automatically from viewport space.
   * `right` anchors the bubble to the right of the trigger (e.g. left-edge sidebar).
   */
  position?: TooltipPosition;
  /** The element that triggers the tooltip */
  children: React.ReactNode;
  className?: string;
  /**
   * When the child is already focusable (e.g. a link), avoid a second tab stop on the tooltip trigger.
   * Hover/focus still opens the tooltip via the wrapper.
   */
  passThroughFocus?: boolean;
  /** Block-level trigger spanning full width (sidebar nav rows). */
  fullWidth?: boolean;
}

type PortalPlacement = 'top' | 'bottom' | 'right';

export function Tooltip({
  label,
  supportingText,
  position: positionProp = 'top',
  children,
  className,
  passThroughFocus = false,
  fullWidth = false,
}: TooltipProps) {
  const tooltipId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placement: PortalPlacement;
  }>({ top: -9999, left: 0, placement: 'top' });

  const wrapClass = [
    styles.wrap,
    fullWidth ? styles.fullWidth : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const updatePosition = useCallback(() => {
    const wrap = wrapRef.current;
    const bubble = bubbleRef.current;
    if (!wrap || !bubble) return;

    const tr = wrap.getBoundingClientRect();
    const br = bubble.getBoundingClientRect();
    const gap = 8;
    const margin = 8;

    if (positionProp === 'right') {
      const left = tr.right + gap;
      let top = tr.top + tr.height / 2 - br.height / 2;
      top = Math.min(
        Math.max(top, margin),
        Math.max(margin, window.innerHeight - br.height - margin)
      );
      setCoords({ top, left, placement: 'right' });
      setPlaced(true);
      return;
    }

    const placeBelow = tr.top < 100;
    let top: number;
    let left: number;
    const placement: PortalPlacement = placeBelow ? 'bottom' : 'top';

    if (placeBelow) {
      top = tr.bottom + gap;
      left = tr.left + tr.width / 2 - br.width / 2;
    } else {
      top = tr.top - gap - br.height;
      left = tr.left + tr.width / 2 - br.width / 2;
    }

    left = Math.min(
      Math.max(left, margin),
      Math.max(margin, window.innerWidth - br.width - margin)
    );

    setCoords({ top, left, placement });
    setPlaced(true);
  }, [positionProp]);

  useLayoutEffect(() => {
    if (!open) return;
    setPlaced(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => updatePosition());
    });
    return () => cancelAnimationFrame(id);
  }, [open, label, supportingText, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => {
      requestAnimationFrame(() => updatePosition());
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) setPlaced(false);
  }, [open]);

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  const onBlurCapture = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && wrapRef.current?.contains(next)) return;
    hide();
  };

  const arrowClass =
    coords.placement === 'right'
      ? styles.portalArrowRight
      : coords.placement === 'top'
        ? styles.portalArrowTop
        : styles.portalArrowBottom;

  const bubbleClass = [
    styles.bubble,
    styles.bubbleFloating,
    placed ? styles.bubbleFloatingPlaced : styles.bubbleFloatingUnplaced,
    arrowClass,
  ]
    .filter(Boolean)
    .join(' ');

  const portal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <span
            ref={bubbleRef}
            id={tooltipId}
            role="tooltip"
            className={bubbleClass}
            style={{
              top: coords.top,
              left: coords.left,
            }}
          >
            <span className={styles.label}>{label}</span>
            {supportingText && (
              <span className={styles.supportingText}>{supportingText}</span>
            )}
          </span>,
          document.body
        )
      : null;

  return (
    <span
      ref={wrapRef}
      className={wrapClass}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocusCapture={show}
      onBlurCapture={onBlurCapture}
    >
      <span
        className={[styles.trigger, fullWidth ? styles.triggerFullWidth : ''].filter(Boolean).join(' ')}
        aria-describedby={open ? tooltipId : undefined}
        tabIndex={passThroughFocus ? -1 : 0}
      >
        {children}
      </span>
      {portal}
    </span>
  );
}
