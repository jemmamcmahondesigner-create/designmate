'use client';

import {
  forwardRef,
  useId,
  type ChangeEventHandler,
  type FocusEventHandler,
  type KeyboardEventHandler,
} from 'react';
import styles from './Textarea.module.css';

export type TextareaSize = 'sm' | 'md' | 'lg';
export type TextareaState = 'default' | 'error' | 'disabled' | 'read-only';
/** Kept for API compatibility; sizing matches `default` (min 90px / max 200px, content-hugging). */
export type TextareaVariant = 'default' | 'form-fixed';

export interface TextareaProps {
  label?: string;
  showLabel?: boolean;
  placeholder?: string;
  helperText?: string;
  showHelper?: boolean;
  errorText?: string;
  value?: string;
  defaultValue?: string;
  size?: TextareaSize;
  state?: TextareaState;
  variant?: TextareaVariant;
  rows?: number;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
  id?: string;
  name?: string;
  className?: string;
  /** Extra class on the focus-ring wrapper around the bordered shell (e.g. tighter layout). */
  fieldShellOuterClassName?: string;
  'aria-label'?: string;
  /** Extra ids (e.g. helper rendered outside the field). Appended to built-in helper id. */
  'aria-describedby'?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label = 'Label',
      showLabel = true,
      placeholder = 'Placeholder text for multiline content...',
      helperText,
      showHelper = false,
      errorText,
      value,
      defaultValue,
      size = 'sm',
      state = 'default',
      variant: _variant = 'default',
      rows,
      onChange,
      onKeyDown,
      onFocus,
      onBlur,
      id: idProp,
      name,
      className,
      fieldShellOuterClassName,
      'aria-label': ariaLabel,
      'aria-describedby': ariaDescribedByExtra,
    },
    ref
  ) {
    const autoId = useId();
    const id = idProp ?? autoId;

    const isDisabled = state === 'disabled';
    const isReadOnly = state === 'read-only';
    const isError = state === 'error';

    const wrapClass = [styles.wrap, className ?? ''].filter(Boolean).join(' ');

    const shellClass = [
      styles.fieldShell,
      isError ? styles.fieldShellError : '',
      isDisabled ? styles.fieldShellDisabled : '',
      isReadOnly ? styles.fieldShellReadOnly : '',
    ]
      .filter(Boolean)
      .join(' ');

    const fieldClass = [
      styles.field,
      styles[`size-${size}`],
      isError ? styles.fieldError : '',
      isDisabled ? styles.fieldDisabled : '',
      isReadOnly ? styles.fieldReadOnly : '',
    ]
      .filter(Boolean)
      .join(' ');

    const labelClass = [
      styles.label,
      isDisabled ? styles.labelDisabled : '',
      isError ? styles.labelError : '',
    ]
      .filter(Boolean)
      .join(' ');

    const helperClass = [
      styles.helper,
      isDisabled ? styles.helperDisabled : '',
      isError ? styles.helperError : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapClass}>
        {showLabel && label && (
          <label htmlFor={id} className={labelClass}>
            {label}
          </label>
        )}

        <div
          className={[styles.fieldShellOuter, fieldShellOuterClassName ?? '']
            .filter(Boolean)
            .join(' ')}
        >
          <div className={shellClass}>
            <div className={styles.fieldScrollClip}>
              <textarea
                ref={ref}
                id={id}
                name={name}
                className={fieldClass}
                placeholder={placeholder}
                disabled={isDisabled}
                readOnly={isReadOnly}
                rows={rows}
                value={value}
                defaultValue={defaultValue}
                onChange={onChange}
                onKeyDown={onKeyDown}
                onFocus={onFocus}
                onBlur={onBlur}
                aria-invalid={isError || undefined}
                aria-label={ariaLabel}
                aria-describedby={
                  [
                    (showHelper && helperText) || (isError && errorText)
                      ? `${id}-helper`
                      : null,
                    ariaDescribedByExtra?.trim() || null,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              />
            </div>
          </div>
        </div>

        {isError && errorText && (
          <p id={`${id}-helper`} className={helperClass} role="alert">
            {errorText}
          </p>
        )}

        {!isError && showHelper && helperText && (
          <p id={`${id}-helper`} className={helperClass}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
