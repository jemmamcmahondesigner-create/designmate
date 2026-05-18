/**
 * Select - DesignTrace DS
 *
 * Canonical implementation extracted from DLS (Figma node 27:2945).
 * Do not reimplement - import from '@/components/ui/ds'.
 *
 * Types:  single | searchable | multi
 * Sizes:  sm (32px) | md (38px)
 * States: default | hover | focused | error | disabled
 *
 * IMPORTANT: This component renders the control shell only.
 * The dropdown overlay/menu must be composed separately using Radix
 * DropdownMenu or Popover at the call site. This matches the DLS spec:
 * "Pair with Menu+MenuItem overlay on open state."
 *
 * Width: always FILL container - never set a fixed width.
 */

'use client'

import React, { useId, useRef, useState } from 'react'
import { Icon } from '../Icon'
import styles from './Select.module.css'

// Option shape used for single and multi selects
export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  /** Field label - always visible above the control */
  label: string
  /** Marks the field as required - appends * to label */
  required?: boolean
  /** Select type - controls internal layout */
  type?: 'single' | 'searchable' | 'multi'
  /** Size - controls height */
  size?: 'sm' | 'md'
  /** Placeholder text shown when no value selected */
  placeholder?: string
  /** Currently selected value(s) for controlled usage */
  value?: string | string[]
  /** The display label for the selected value (single type) */
  selectedLabel?: string
  /** Helper text shown below the control */
  helperText?: string
  /** Whether to show helper text */
  showHelper?: boolean
  /** Error state */
  error?: boolean
  /** Error message shown below control when error is true */
  errorMessage?: string
  /** Disabled state */
  disabled?: boolean
  /** Whether the dropdown is open - controlled externally */
  isOpen?: boolean
  /** Search query value (searchable type) */
  searchValue?: string
  /** Search input change handler (searchable type) */
  onSearchChange?: (value: string) => void
  /** Called when the control shell is clicked - use to open your dropdown */
  onOpen?: () => void
  /** Called when a chip remove button is clicked (multi type) */
  onRemove?: (value: string) => void
  /** Selected chips to render below the field (multi type) */
  selectedChips?: React.ReactNode
  /** Additional className for layout positioning only */
  className?: string
  /** Stable id override - defaults to generated id */
  fieldId?: string
  /** aria-controls - wire to the dropdown panel id */
  'aria-controls'?: string
}

export function Select({
  label,
  required = false,
  type = 'single',
  size = 'sm',
  placeholder,
  selectedLabel,
  helperText,
  showHelper = true,
  error = false,
  errorMessage,
  disabled = false,
  isOpen = false,
  searchValue = '',
  onSearchChange,
  onOpen,
  selectedChips,
  className,
  fieldId,
  'aria-controls': ariaControls,
}: SelectProps) {
  const uid = useId()
  const inputId = fieldId ?? `select-${uid}`
  const helperId = `select-helper-${uid}`
  const errorId = `select-error-${uid}`
  const inputRef = useRef<HTMLInputElement>(null)

  const describedBy = [
    error && errorMessage ? errorId : null,
    !error && showHelper && helperText ? helperId : null,
  ].filter(Boolean).join(' ') || undefined

  const controlClass = [
    styles.control,
    styles[`size-${size}`],
    error ? styles.controlError : '',
    disabled ? styles.controlDisabled : '',
    isOpen ? styles.controlOpen : '',
  ].filter(Boolean).join(' ')

  const isSearchable = type === 'searchable'
  const hasValue = Boolean(selectedLabel)

  return (
    <div className={`${styles.root} ${className ?? ''}`}>
      {/* Label */}
      <label
        htmlFor={inputId}
        className={styles.label}
      >
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">*</span>
        )}
      </label>

      {/* Control shell */}
      <div
        className={controlClass}
        onClick={disabled ? undefined : onOpen}
        role={isSearchable ? undefined : 'combobox'}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={ariaControls}
        aria-disabled={disabled}
      >
        {/* Content area */}
        <div className={styles.content}>
          {isSearchable ? (
            /* Searchable - real text input */
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              className={styles.searchInput}
              placeholder={placeholder}
              value={searchValue}
              onChange={e => onSearchChange?.(e.target.value)}
              disabled={disabled}
              aria-describedby={describedBy}
              aria-controls={ariaControls}
              aria-autocomplete="list"
              aria-expanded={isOpen}
              autoComplete="off"
            />
          ) : (
            /* Single/multi - display value or placeholder */
            <span
              id={inputId}
              className={hasValue ? styles.value : styles.placeholder}
            >
              {hasValue ? selectedLabel : placeholder}
            </span>
          )}
        </div>

        {/* Trailing icon */}
        <span className={styles.trailingIcon}>
          {isSearchable ? (
            <Icon name="search" size={16} />
          ) : (
            <Icon
              name="chevron-down"
              size={16}
              className={isOpen ? styles.iconRotated : ''}
            />
          )}
        </span>
      </div>

      {/* Selected chips - multi type renders these below the control */}
      {type === 'multi' && selectedChips && (
        <div className={styles.chips}>
          {selectedChips}
        </div>
      )}

      {/* Error message */}
      {error && errorMessage && (
        <p id={errorId} className={styles.errorText} role="alert">
          {errorMessage}
        </p>
      )}

      {/* Helper text */}
      {!error && showHelper && helperText && (
        <p id={helperId} className={styles.helperText}>
          {helperText}
        </p>
      )}
    </div>
  )
}

export default Select
