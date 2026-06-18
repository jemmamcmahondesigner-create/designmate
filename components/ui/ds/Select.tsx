'use client';

import {
  useState,
  useRef,
  useId,
  useEffect,
  useLayoutEffect,
  useCallback,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import styles from './Select.module.css';

export type SelectSize = 'sm' | 'md' | 'lg';
export type SelectState = 'default' | 'hover' | 'focused' | 'filled' | 'error' | 'disabled';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Native tooltip for disabled or informational options. */
  title?: string;
}

const CREATE_PREFIX = '__create__:';

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  /** Marks the field as required — appends * to label */
  required?: boolean;
  helperText?: string;
  errorText?: string;
  size?: SelectSize;
  disabled?: boolean;
  /** Disabled control styling without dimming the label (e.g. read-only forms). */
  readOnly?: boolean;
  /** Renders the menu open immediately (for searchable/autocomplete UX) */
  searchable?: boolean;
  /**
   * When used with `searchable`, appends an "Add …" row for typed values with no exact
   * name match (case-insensitive).
   */
  creatable?: boolean;
  /** Label for the add row (default: Add '[typed]'). */
  creatableOptionLabel?: (typedLabel: string) => string;
  /** Persists a custom value locally (return value id); does not call the server. */
  onCreatableSelect?: (typedLabel: string) => string | undefined;
  /** Creates a global option via async handler (e.g. reference table). */
  onCreateOption?: (typedLabel: string) => Promise<string | undefined>;
  id?: string;
  name?: string;
  className?: string;
  /**
   * When true, menu is portaled to document.body with position fixed from trigger
   * getBoundingClientRect() — use inside overflow:hidden containers (e.g. modals).
   * When false, menu is position:absolute; top:100% under the trigger wrapper.
   */
  portaled?: boolean;
  /** When portaled, close the menu on scroll outside the trigger/menu (e.g. drawer body). */
  closeOnScroll?: boolean;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  required = false,
  helperText,
  errorText,
  size = 'sm',
  disabled = false,
  readOnly = false,
  searchable = false,
  creatable = false,
  creatableOptionLabel,
  onCreatableSelect,
  onCreateOption,
  id: idProp,
  name,
  className,
  portaled = false,
  closeOnScroll = false,
}: SelectProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>(240);
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find(o => o.value === value);
  const customSelectedLabel =
    value?.startsWith(CREATE_PREFIX) && !selectedOption
      ? decodeURIComponent(value.slice(CREATE_PREFIX.length))
      : null;
  const unmatchedValueLabel =
    value && !selectedOption && !value.startsWith(CREATE_PREFIX) ? value : null;
  const displayLabel =
    selectedOption?.label ?? customSelectedLabel ?? unmatchedValueLabel ?? '';
  const hasError = !!errorText;
  const isFilled = !!value;

  const filteredOptions =
    searchable && searchTerm
      ? options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()))
      : options;

  const trimmedSearch = searchTerm.trim();
  const hasExactMatch =
    trimmedSearch.length > 0 &&
    options.some(o => o.label.toLowerCase() === trimmedSearch.toLowerCase());

  const canAddCustom =
    creatable && searchable && trimmedSearch.length >= 2 && !hasExactMatch;

  const createValue =
    canAddCustom && (onCreatableSelect || onCreateOption)
      ? `${CREATE_PREFIX}${encodeURIComponent(trimmedSearch)}`
      : null;

  const displayOptions: SelectOption[] = [...filteredOptions];
  if (createValue) {
    const addLabel = creatableOptionLabel
      ? creatableOptionLabel(trimmedSearch)
      : `Add '${trimmedSearch}'`;
    displayOptions.push({
      value: createValue,
      label: addLabel,
    });
  }

  const showNoResults = displayOptions.length === 0;

  const updatePortalPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || !open || !portaled) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding - gap;
    const spaceAbove = rect.top - viewportPadding - gap;
    const prefersTop = spaceBelow < 200 && spaceAbove > spaceBelow;
    const availableHeight = prefersTop ? spaceAbove : spaceBelow;
    const mh = Math.max(120, Math.min(240, Math.floor(availableHeight)));

    setMenuMaxHeight(mh);

    if (prefersTop) {
      setPortalStyle({
        position: 'fixed',
        left: Math.round(rect.left),
        right: 'auto',
        width: Math.round(rect.width),
        bottom: Math.round(window.innerHeight - rect.top + gap),
        maxHeight: mh,
        zIndex: 10000,
        marginTop: 0,
      });
    } else {
      setPortalStyle({
        position: 'fixed',
        left: Math.round(rect.left),
        right: 'auto',
        width: Math.round(rect.width),
        top: Math.round(rect.bottom + gap),
        maxHeight: mh,
        zIndex: 10000,
        marginTop: 0,
      });
    }
  }, [open, portaled]);

  useLayoutEffect(() => {
    if (!open) return;
    if (portaled) {
      updatePortalPosition();
      return;
    }
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const mh = Math.max(120, Math.min(240, Math.floor(spaceBelow)));
    setMenuMaxHeight(mh);
  }, [open, portaled, displayOptions.length, searchTerm, updatePortalPosition]);

  useEffect(() => {
    if (!open || !portaled) return;
    const onScroll = (e: Event) => {
      if (closeOnScroll) {
        const target = e.target as Node;
        if (menuRef.current?.contains(target)) return;
        if (wrapperRef.current?.contains(target)) return;
        setOpen(false);
        return;
      }
      requestAnimationFrame(() => updatePortalPosition());
    };
    const onResize = () => {
      requestAnimationFrame(() => updatePortalPosition());
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, portaled, closeOnScroll, updatePortalPosition]);

  const finishSelect = useCallback(
    (optValue: string, options?: { focusTrigger?: boolean }) => {
      onChange?.(optValue);
      setOpen(false);
      setSearchTerm('');
      if (options?.focusTrigger !== false) {
        triggerRef.current?.focus();
      }
    },
    [onChange],
  );

  const confirmTypedSearch = useCallback(
    (finishOpts?: { focusTrigger?: boolean }) => {
      if (!creatable || !searchable) return false;
      const typed = searchTerm.trim();
      if (!typed) return false;

      const exactOption = options.find(
        (o) =>
          o.label.toLowerCase() === typed.toLowerCase() ||
          o.value.toLowerCase() === typed.toLowerCase(),
      );
      if (exactOption) {
        finishSelect(exactOption.value, finishOpts);
        return true;
      }

      if (onCreatableSelect) {
        const nextValue = onCreatableSelect(typed);
        if (nextValue) {
          finishSelect(nextValue, finishOpts);
          return true;
        }
      }

      if (onCreateOption) {
        void (async () => {
          const newId = await onCreateOption(typed);
          if (newId) finishSelect(newId, finishOpts);
        })();
        return true;
      }

      if (creatable) {
        finishSelect(`${CREATE_PREFIX}${encodeURIComponent(typed)}`, finishOpts);
        return true;
      }

      return false;
    },
    [
      creatable,
      searchable,
      searchTerm,
      options,
      onCreatableSelect,
      onCreateOption,
      finishSelect,
    ],
  );

  const closeMenu = useCallback(
    (confirmCustom = false) => {
      if (confirmCustom) {
        confirmTypedSearch();
      }
      setOpen(false);
    },
    [confirmTypedSearch],
  );

  // Close on outside mousedown only (not keyboard; mousedown fires before blur)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu(true);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeMenu]);

  const handleSelect = (optValue: string) => {
    if (optValue.startsWith(CREATE_PREFIX)) {
      const raw = decodeURIComponent(optValue.slice(CREATE_PREFIX.length));
      if (onCreatableSelect) {
        const nextValue = onCreatableSelect(raw);
        if (nextValue) finishSelect(nextValue);
        return;
      }
      if (!onCreateOption) return;
      void (async () => {
        const newId = await onCreateOption(raw);
        if (newId) finishSelect(newId);
      })();
      return;
    }
    finishSelect(optValue);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (searchable && open) {
      return;
    }

    if (e.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(o => !o);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ') {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'Tab') {
      if (confirmTypedSearch({ focusTrigger: false })) return;
      closeMenu(false);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (confirmTypedSearch()) return;
      if (createValue) {
        handleSelect(createValue);
        return;
      }
      const first = displayOptions.find(o => !o.disabled);
      if (first) {
        handleSelect(first.value);
      }
    }
  };

  const isControlInactive = disabled || readOnly;

  const controlClass = [
    styles.control,
    styles[`size-${size}`],
    hasError ? styles.error : '',
    isControlInactive ? styles.disabled : '',
    open ? styles.open : '',
    isFilled && !hasError ? styles.filled : '',
  ]
    .filter(Boolean)
    .join(' ');

  const labelClass = [
    styles.label,
    hasError ? styles.labelError : '',
  ]
    .filter(Boolean)
    .join(' ');

  const menuClassName = portaled
    ? [styles.menu, styles.menuPortal].join(' ')
    : [styles.menu, styles.menuAttached].join(' ');

  const menuStyle: CSSProperties = portaled
    ? { ...portalStyle, maxHeight: menuMaxHeight, marginTop: 0 }
    : { maxHeight: menuMaxHeight, marginTop: 0 };

  const menu = open ? (
    <ul
      ref={menuRef}
      role="listbox"
      aria-label={label ?? 'Options'}
      className={menuClassName}
      style={menuStyle}
    >
      {showNoResults && (
        <li className={styles.noResults}>No options found</li>
      )}
      {displayOptions.map(option => (
        <li
          key={option.value}
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled}
          className={[
            styles.menuItem,
            option.value === value ? styles.menuItemSelected : '',
            option.disabled ? styles.menuItemDisabled : '',
            option.value.startsWith(CREATE_PREFIX) ? styles.menuItemCreate : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onMouseDown={e => e.preventDefault()}
          onClick={() => !option.disabled && handleSelect(option.value)}
          title={option.title}
        >
          {option.label}
          {option.value === value && !option.value.startsWith(CREATE_PREFIX) && (
            <Icon name="check" size={14} className={styles.checkIcon} />
          )}
        </li>
      ))}
    </ul>
  ) : null;

  const menuNode =
    portaled && typeof document !== 'undefined' && menu
      ? createPortal(menu, document.body)
      : menu;

  return (
    <div className={[styles.root, className ?? ''].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={id} className={labelClass}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {/* Hidden native select for form submission (creatable rows are omitted) */}
      <select
        name={name}
        value={value ?? ''}
        disabled={isControlInactive}
        aria-hidden="true"
        tabIndex={-1}
        style={{ display: 'none' }}
        onChange={e => onChange?.(e.target.value)}
      >
        <option value="" />
        {options.map(o => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Custom control */}
      <div ref={wrapperRef} className={styles.wrapper}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-disabled={isControlInactive}
          disabled={isControlInactive}
          className={controlClass}
          onClick={(e) => {
            if (isControlInactive) return;
            if (searchable && open && e.detail === 0) return;
            if (searchable && e.target instanceof HTMLInputElement) {
              if (!open) setOpen(true);
              return;
            }
            setOpen(o => !o);
          }}
          onKeyDown={handleKeyDown}
        >
          {searchable && open ? (
            <input
              className={styles.searchInput}
              value={searchTerm}
              placeholder={displayLabel || placeholder}
              onChange={e => setSearchTerm(e.target.value)}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              onKeyDown={(e) => {
                if (e.key === ' ') {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                }
                handleSearchKeyDown(e);
              }}
              onBlur={() => {
                if (confirmTypedSearch({ focusTrigger: false })) return;
                setOpen(false);
              }}
              autoFocus
              aria-label="Search options"
            />
          ) : (
            <span
              className={
                displayLabel
                  ? [
                      styles.valueText,
                      disabled && !readOnly ? styles.valueTextDisabled : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  : styles.placeholderText
              }
            >
              {displayLabel || placeholder}
            </span>
          )}
          <Icon
            name={open ? 'chevron-up' : 'chevron-down'}
            size={size === 'sm' ? 14 : size === 'md' ? 16 : 18}
            className={styles.chevron}
            aria-hidden="true"
          />
        </button>
        {!portaled ? menuNode : null}
      </div>

      {portaled ? menuNode : null}

      {/* Helper / error text */}
      {hasError && (
        <p className={styles.errorText} role="alert">
          {errorText}
        </p>
      )}
      {!hasError && helperText && (
        <p className={styles.helperText}>{helperText}</p>
      )}
    </div>
  );
}
