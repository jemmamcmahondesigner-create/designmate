'use client';

import styles from './Skeleton.module.css';

export type SkeletonShape = 'Text' | 'Circular';
export type SkeletonBackground = 'Default' | 'Focused';

export interface SkeletonProps {
  shape?: SkeletonShape;
  background?: SkeletonBackground;
  waveAnimation?: boolean;
  className?: string;
}

export function Skeleton({
  shape = 'Text',
  background = 'Default',
  waveAnimation = false,
  className,
}: SkeletonProps) {
  const shapeClass = shape === 'Circular' ? styles.circular : styles.text;
  const backgroundClass = waveAnimation
    ? ''
    : background === 'Focused'
      ? styles.focused
      : styles.default;

  return (
    <div
      aria-hidden="true"
      className={[
        styles.root,
        shapeClass,
        backgroundClass,
        waveAnimation ? 'skeleton-wave' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
