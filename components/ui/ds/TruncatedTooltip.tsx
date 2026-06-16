'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Tooltip, type TooltipPosition } from './Tooltip';
import styles from './TruncatedTooltip.module.css';

export interface TruncatedTooltipProps {
  /** Full text shown in the tooltip when content is truncated. */
  label: string;
  children?: ReactNode;
  className?: string;
  fullWidth?: boolean;
  /** Inline-flex wrapper for pills / badges (measures overflow on the wrapper). */
  inlineFlex?: boolean;
  maxWidth?: number;
  position?: TooltipPosition;
}

export function TruncatedTooltip({
  label,
  children,
  className,
  fullWidth = false,
  inlineFlex = false,
  maxWidth = 320,
  position = 'top',
}: TruncatedTooltipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const checkTruncation = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth);
  }, []);

  useLayoutEffect(() => {
    checkTruncation();
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => checkTruncation());
    observer.observe(el);
    return () => observer.disconnect();
  }, [label, children, checkTruncation]);

  const rootClass = [
    inlineFlex ? styles.measureInlineFlex : fullWidth ? styles.fullWidth : styles.inline,
    !inlineFlex ? styles.root : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <span ref={ref} className={rootClass}>
      {children ?? label}
    </span>
  );

  if (!isTruncated || !label.trim()) return content;

  return (
    <Tooltip label={label} position={position} fullWidth={fullWidth} maxWidth={maxWidth}>
      {content}
    </Tooltip>
  );
}
