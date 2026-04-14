/**
 * Input — DesignMate DS
 *
 * Canonical implementation extracted from DLS (Figma node 22:1382).
 * Do not reimplement — import from '@/components/ui/ds'.
 *
 * Sizes:   sm (32px) | md (38px) | lg (44px)
 * States:  default | hover | focused | error | disabled
 *
 * Width: always FILL container — never set a fixed width on the component itself.
 * Min-widths: sm → 160px, md → 200px, lg → 240px
 */

import React, { useId } from 'react'
import styles from './Input.module.css'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface InputProps {
  /** Field label — always visible above the input */
  label: string
  /** Marks the field as required — appends * to label */
  required?: boolean
  /** Input placeholder text */
  placeholder?: string
  /** Current value (controlled) */
  value?: string
  /** Default value (uncontrolled) */
  defaultValue?: string
  /** Size variant — controls field height */
  size?: 'sm' | 'md' | 'lg'
  /** Error state — shows error border and errorMessage below field */
  error?: boolean
  /** Error message shown below field when error is true */
  errorMessage?: string
  /** Helper / hint text shown below field (hidden when error is true) */
  helperText?: string
  /** Whether to show helper text */
  showHelper?: boolean
  /** Disabled state */
  disabled?: boolean
  /** HTML input type */
  type?: 'text' | 'email' | 'password' | 'search' | 'url' | 'number' | 'tel'
  /** onChange handler */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** onBlur handler */
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  /** onFocus handler */
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void
  /** Additional class on the root wrapper — for layout positioning only */
  className?: string
  /** aria-describedby — auto-set from helperText/errorMessage, override if needed */
  'aria-describedby'?: string
  /** name attribute for form submission */
  name?: string
  /** Stable id for the input and label `htmlFor` (defaults to generated id) */
  fieldId?: string
  /** autocomplete attribute */
  autoComplete?: string
  /** For combobox / listbox pairing */
  'aria-controls'?: string
  /** For combobox / search semantics */
  'aria-autocomplete'?: 'none' | 'list' | 'inline' | 'both'
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      label,
      required = false,
      placeholder,
      value,
      defaultValue,
      size = 'sm',
      error = false,
      errorMessage,
      helperText,
      showHelper = true,
      disabled = false,
      type = 'text',
      onChange,
      onBlur,
      onFocus,
      className,
      'aria-describedby': ariaDescribedBy,
      name,
      fieldId,
      autoComplete,
      'aria-controls': ariaControls,
      'aria-autocomplete': ariaAutocomplete,
    },
    ref
  ) {
    const uid = useId()
    const inputId = fieldId ?? `input-${uid}`
    const helperId = `input-helper-${uid}`
    const errorId = `input-error-${uid}`

    const autoDescribedBy =
      [
        error && errorMessage ? errorId : null,
        !error && showHelper && helperText ? helperId : null,
      ]
        .filter(Boolean)
        .join(' ') || undefined

    const describedBy = ariaDescribedBy ?? autoDescribedBy

    const fieldClass = [
      styles.field,
      styles[`size-${size}`],
      error ? styles.fieldError : '',
      disabled ? styles.fieldDisabled : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div className={`${styles.root} ${className ?? ''}`}>
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          )}
        </label>

        <div className={fieldClass}>
          <input
            ref={ref}
            id={inputId}
            name={name}
            type={type}
            value={value}
            defaultValue={defaultValue}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-required={required}
            aria-invalid={error}
            aria-describedby={describedBy}
            aria-controls={ariaControls}
            aria-autocomplete={ariaAutocomplete}
            autoComplete={autoComplete}
            className={styles.input}
            onChange={onChange}
            onBlur={onBlur}
            onFocus={onFocus}
          />
        </div>

        {error && errorMessage && (
          <p id={errorId} className={styles.errorText} role="alert">
            {errorMessage}
          </p>
        )}

        {!error && showHelper && helperText && (
          <p id={helperId} className={styles.helperText}>
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
