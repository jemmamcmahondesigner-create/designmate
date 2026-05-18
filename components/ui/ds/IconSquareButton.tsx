'use client';

import { forwardRef } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './IconSquareButton.module.css';

export type IconSquareButtonProps = {
  icon: IconName;
  /** Visible label; also used as default aria-label when ariaLabel omitted */
  label: string;
  variant?: 'default' | 'ghost';
  onClick?: () => void;
  disabled?: boolean;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  'aria-label'?: string;
  iconSize?: number;
};

export const IconSquareButton = forwardRef<HTMLButtonElement, IconSquareButtonProps>(
  function IconSquareButton(
    {
      icon,
      label,
      variant = 'default',
      onClick,
      disabled = false,
      'aria-expanded': ariaExpanded,
      'aria-haspopup': ariaHaspopup,
      'aria-label': ariaLabel,
      iconSize = 14,
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        className={[styles.root, variant === 'ghost' ? styles.rootGhost : '']
          .filter(Boolean)
          .join(' ')}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        aria-expanded={ariaExpanded}
        aria-haspopup={ariaHaspopup}
      >
        <Icon name={icon} size={iconSize} />
      </button>
    );
  },
);
