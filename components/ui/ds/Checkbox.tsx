'use client';

import { useId } from 'react';
import styles from './Checkbox.module.css';

export type CheckboxState = 'unchecked' | 'checked' | 'indeterminate';
export type CheckboxSentiment = 'base' | 'danger';

export interface CheckboxProps {
  /** Visible label beside the checkbox */
  label?: string;
  /** Controlled checked state */
  checked?: boolean;
  /** Indeterminate — overrides checked if true */
  indeterminate?: boolean;
  /** Danger sentiment — red border on unchecked */
  sentiment?: CheckboxSentiment;
  disabled?: boolean;
  /** Strikethrough the label text when checked */
  strikethrough?: boolean;
  onChange?: (checked: boolean) => void;
  id?: string;
  name?: string;
  value?: string;
  className?: string;
}

export function Checkbox({
  label,
  checked = false,
  indeterminate = false,
  sentiment = 'base',
  disabled = false,
  strikethrough = false,
  onChange,
  id: idProp,
  name,
  value,
  className,
}: CheckboxProps) {
  const autoId = useId();
  const id = idProp ?? autoId;

  // Attach indeterminate imperatively via ref — React doesn't support it as a prop
  const setRef = (el: HTMLInputElement | null) => {
    if (el) el.indeterminate = indeterminate;
  };

  const state: CheckboxState = indeterminate
    ? 'indeterminate'
    : checked
    ? 'checked'
    : 'unchecked';

  const wrapClass = [
    styles.wrap,
    disabled ? styles.disabled : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const boxClass = [
    styles.box,
    state === 'checked' || state === 'indeterminate' ? styles.boxChecked : styles.boxUnchecked,
    sentiment === 'danger' && state === 'unchecked' ? styles.boxDanger : '',
    disabled ? styles.boxDisabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  const labelClass = [
    styles.label,
    disabled ? styles.labelDisabled : '',
    strikethrough && state === 'checked' ? styles.labelStrike : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label htmlFor={id} className={wrapClass}>
      {/* Hidden native input — drives accessibility */}
      <input
        ref={setRef}
        type="checkbox"
        id={id}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={e => onChange?.(e.target.checked)}
        className={styles.nativeInput}
        aria-checked={indeterminate ? 'mixed' : checked}
      />

      {/* Visual box */}
      <span className={styles.boxWrap} aria-hidden="true">
        <span className={boxClass}>
          {state === 'checked' && (
            <CheckIcon />
          )}
          {state === 'indeterminate' && (
            <DashIcon />
          )}
        </span>
      </span>

      {/* Label text */}
      {label && (
        <span className={labelClass}>{label}</span>
      )}
    </label>
  );
}

/* ── Inline SVG icons — avoids expiring Figma CDN URLs ──────────────────────── */

function CheckIcon() {
  return (
    <svg
      width="12"
      height="10"
      viewBox="0 0 12 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M1 5L4.5 8.5L11 1.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg
      width="10"
      height="2"
      viewBox="0 0 10 2"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="10" height="2" rx="1" fill="white" />
    </svg>
  );
}
