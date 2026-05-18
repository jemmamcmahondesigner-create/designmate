'use client';

import type { Ref } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './ButtonGroup.module.css';

export type ButtonGroupVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonGroupSize = 'sm' | 'md' | 'lg';

export interface ButtonGroupProps {
  /** Primary action label */
  label: string;
  /** Optional leading icon in the primary segment (e.g. plus + “Review”). */
  primaryLeadingIcon?: IconName;
  variant?: ButtonGroupVariant;
  size?: ButtonGroupSize;
  /** Called when the primary label section is clicked */
  onPrimaryClick?: () => void;
  /** Called when the chevron/arrow trigger is clicked — opens a menu */
  onMenuClick?: () => void;
  /** Alias for `onMenuClick` (split-button chevron) */
  onArrowClick?: () => void;
  /** Ref for the chevron trigger (Menu `anchorRef`) */
  arrowRef?: Ref<HTMLButtonElement>;
  /** aria-label for the arrow trigger */
  menuAriaLabel?: string;
  /** Mirrors menu open state for the chevron */
  menuExpanded?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ButtonGroup({
  label,
  primaryLeadingIcon,
  variant = 'primary',
  size = 'sm',
  onPrimaryClick,
  onMenuClick,
  onArrowClick,
  arrowRef,
  menuAriaLabel = 'More options',
  menuExpanded,
  disabled = false,
  className,
}: ButtonGroupProps) {
  const handleArrowClick = onArrowClick ?? onMenuClick;

  const rootClass = [
    styles.root,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    disabled ? styles.disabled : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const iconSize = size === 'sm' ? 14 : size === 'md' ? 16 : 20;

  const primaryClass = [
    styles.primaryAction,
    primaryLeadingIcon ? styles.primaryActionWithLeadingIcon : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass} role="group">
      <button
        type="button"
        className={primaryClass}
        onClick={onPrimaryClick}
        disabled={disabled}
      >
        {primaryLeadingIcon ? (
          <>
            <Icon name={primaryLeadingIcon} size={iconSize} aria-hidden />
            <span>{label}</span>
          </>
        ) : (
          label
        )}
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <button
        type="button"
        ref={arrowRef}
        className={styles.arrowTrigger}
        onClick={handleArrowClick}
        disabled={disabled}
        aria-label={menuAriaLabel}
        aria-haspopup="menu"
        aria-expanded={menuExpanded ?? false}
      >
        <Icon name="chevron-down" size={iconSize} />
      </button>
    </div>
  );
}
