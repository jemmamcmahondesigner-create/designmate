'use client';

import styles from './Divider.module.css';

export type DividerOrientation = 'horizontal' | 'vertical';

export interface DividerProps {
  orientation?: DividerOrientation;
  className?: string;
}

export function Divider({ orientation = 'horizontal', className }: DividerProps) {
  const rootClass = [
    styles.root,
    orientation === 'vertical' ? styles.vertical : styles.horizontal,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      role="separator"
      aria-orientation={orientation}
      className={rootClass}
    />
  );
}
