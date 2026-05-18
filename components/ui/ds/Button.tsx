/**
 * Button — DesignTrace DS
 *
 * Canonical implementation extracted from DLS (Figma node 2:673).
 * Do not reimplement — import from '@/components/ui/ds'.
 *
 * Variants:  primary | secondary | ghost | destructive | accent | primary-on-dark | ghost-on-dark
 * Sizes:     sm | md | lg
 * States:    default | disabled
 * Icon:      none | leading | trailing
 */

import React from 'react'
import { Icon, resolveIconName } from './Icon'
import styles from './Button.module.css'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ButtonProps {
  /** The button label text */
  label: string
  /** Visual variant — controls colour scheme */
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'accent' | 'primary-on-dark' | 'ghost-on-dark'
  /** Size — controls height, padding, and font size */
  size?: 'sm' | 'md' | 'lg'
  /** Whether the button is disabled */
  disabled?: boolean
  /** Icon placement relative to label */
  icon?: 'none' | 'leading' | 'trailing'
  /** Icon-only mode — hides label, requires aria-label on parent or label used as aria-label */
  iconOnly?: boolean
  /** Icon name to render (required when icon !== 'none') */
  iconName?: string
  /** Click handler */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  /** Additional class names — use sparingly, only for layout positioning */
  className?: string
  /** Inline styles — use sparingly (e.g. dynamic status colours); overrides variant where both apply */
  style?: React.CSSProperties
  /** DOM id — for anchors, `aria-labelledby`, or tests */
  id?: string
  /** HTML button type */
  type?: 'button' | 'submit' | 'reset'
  /** Accessible label — required when iconOnly is true */
  'aria-label'?: string
  /** For disclosure / menu triggers */
  'aria-expanded'?: boolean
  'aria-haspopup'?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'
  'aria-labelledby'?: string
  /** Override native role (e.g. menuitem) */
  role?: React.AriaRole
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Button({
  label,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  icon = 'none',
  iconOnly = false,
  iconName,
  onClick,
  className,
  style,
  id,
  type = 'button',
  'aria-label': ariaLabel,
  'aria-expanded': ariaExpanded,
  'aria-haspopup': ariaHaspopup,
  'aria-labelledby': ariaLabelledby,
  role,
}: ButtonProps) {
  const iconSize = size === 'lg' ? 16 : 14
  const resolvedIcon = resolveIconName(iconName)

  const classList = [
    styles.root,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    iconOnly ? styles.iconOnly : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      id={id}
      type={type}
      role={role}
      className={classList}
      style={style}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={iconOnly ? (ariaLabel ?? label) : ariaLabel}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      aria-labelledby={ariaLabelledby}
      onClick={disabled ? undefined : onClick}
    >
      {icon === 'leading' && resolvedIcon && (
        <span className={styles.icon}>
          <Icon name={resolvedIcon} size={iconSize} />
        </span>
      )}

      {!iconOnly && (
        <span className={styles.label}>{label}</span>
      )}

      {icon === 'trailing' && resolvedIcon && (
        <span className={styles.icon}>
          <Icon name={resolvedIcon} size={iconSize} />
        </span>
      )}
    </button>
  )
}

export default Button
