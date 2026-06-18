"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  resolveRelatedArtifactDropdownLabel,
  type RelatedArtifactSelection,
  type RelatedArtifactSelectStructure,
  type RelatedArtifactVersionSelectOption,
} from "@/components/artifact-modals/artifactModalShared";
import { formatVersionLabel } from "@/lib/artifacts/versioning";
import { Button, Checkbox, Icon } from "@/components/ui/ds";
import { Menu } from "@/components/ui/ds/Menu";
import selectStyles from "@/components/ui/ds/Select.module.css";
import menuStyles from "@/components/ui/ds/Menu.module.css";
import styles from "./RelatedArtifactSelect.module.css";

type RelatedArtifactSelectProps = {
  id: string;
  label?: string;
  selection: RelatedArtifactSelection;
  onSelectionChange: (selection: RelatedArtifactSelection) => void;
  options: RelatedArtifactSelectStructure;
  disabled?: boolean;
  placeholder?: string;
};

function formatVersionSuffix(versionNumber: string): string {
  return ` · ${formatVersionLabel(versionNumber)}`;
}

function GroupDivider() {
  return <li role="separator" className={styles.groupDivider} aria-hidden="true" />;
}

function GroupHeader({ label }: { label: string }) {
  return (
    <li role="presentation" className={styles.groupHeader} aria-hidden="true">
      {label}
    </li>
  );
}

function NewArtifactRow({
  label,
  indeterminate,
  onSelect,
}: {
  label: string;
  indeterminate: boolean;
  onSelect: () => void;
}) {
  return (
    <li
      role="menuitemcheckbox"
      aria-checked={indeterminate ? "mixed" : false}
      tabIndex={0}
      className={menuStyles.item}
      onClick={onSelect}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <Checkbox
        checked={false}
        indeterminate={indeterminate}
        onChange={() => onSelect()}
        className={styles.rowCheckbox}
      />
      <span className={menuStyles.itemLabel}>{label}</span>
    </li>
  );
}

function VersionMenuItem({
  option,
  checked,
  onToggle,
}: {
  option: RelatedArtifactVersionSelectOption;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={0}
      className={menuStyles.item}
      onClick={onToggle}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      <Checkbox
        checked={checked}
        onChange={() => onToggle()}
        className={styles.rowCheckbox}
      />
      <span className={menuStyles.itemLabel}>
        <span className={`${styles.versionItemLabel} ${styles.versionItemName}`}>
          {option.versionLabel}
        </span>
        <span className={`${styles.versionItemLabel} ${styles.versionItemSuffix}`}>
          {formatVersionSuffix(option.versionNumber)}
        </span>
      </span>
    </li>
  );
}

function RelatedArtifactMenuFooter({
  applyDisabled,
  onApply,
  onReset,
}: {
  applyDisabled: boolean;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <div className={styles.menuFooter}>
      <Button
        label="Apply"
        variant="primary"
        size="sm"
        disabled={applyDisabled}
        onClick={(event) => {
          event.stopPropagation();
          onApply();
        }}
      />
      <button
        type="button"
        className={styles.resetLink}
        onClick={(event) => {
          event.stopPropagation();
          onReset();
        }}
      >
        Reset
      </button>
    </div>
  );
}

function RelatedArtifactMenuItems({
  options,
  draftVersionIds,
  draftNewArtifact,
  onToggleVersion,
  onSelectNewArtifact,
}: {
  options: RelatedArtifactSelectStructure;
  draftVersionIds: string[];
  draftNewArtifact: boolean;
  onToggleVersion: (versionId: string) => void;
  onSelectNewArtifact: () => void;
}) {
  const checkedIds = new Set(draftVersionIds);

  return (
    <>
      <NewArtifactRow
        label={options.newArtifact.label}
        indeterminate={draftNewArtifact && draftVersionIds.length === 0}
        onSelect={onSelectNewArtifact}
      />
      {options.groups.length > 0 ? <GroupDivider /> : null}
      {options.groups.map((group, groupIndex) => (
        <Fragment key={`${group.groupLabel}-${group.options[0]?.artifactId ?? groupIndex}`}>
          {group.options.length > 1 ? <GroupHeader label={group.groupLabel} /> : null}
          {group.options.map((option) => (
            <VersionMenuItem
              key={option.value}
              option={option}
              checked={checkedIds.has(option.value)}
              onToggle={() => onToggleVersion(option.value)}
            />
          ))}
          {groupIndex < options.groups.length - 1 ? <GroupDivider /> : null}
        </Fragment>
      ))}
    </>
  );
}

export function RelatedArtifactSelect({
  id,
  label = "Related Artifact",
  selection,
  onSelectionChange,
  options,
  disabled = false,
  placeholder = "New artifact",
}: RelatedArtifactSelectProps) {
  const [open, setOpen] = useState(false);
  const [draftVersionIds, setDraftVersionIds] = useState<string[]>([]);
  const [draftNewArtifact, setDraftNewArtifact] = useState(true);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const displayLabel = resolveRelatedArtifactDropdownLabel(selection, options);
  const isFilled = displayLabel.length > 0;
  const applyDisabled = !draftNewArtifact && draftVersionIds.length === 0;

  useEffect(() => {
    if (!open) return;
    if (selection.type === "new") {
      setDraftVersionIds([]);
      setDraftNewArtifact(true);
      return;
    }
    setDraftVersionIds([...selection.versionIds]);
    setDraftNewArtifact(selection.versionIds.length === 0);
  }, [open, selection]);

  const handleToggleVersion = useCallback((versionId: string) => {
    setDraftVersionIds((current) => {
      const next = current.includes(versionId)
        ? current.filter((id) => id !== versionId)
        : [...current, versionId];
      setDraftNewArtifact(next.length === 0);
      return next;
    });
  }, []);

  const handleSelectNewArtifact = useCallback(() => {
    setDraftVersionIds([]);
    setDraftNewArtifact(true);
  }, []);

  const handleReset = useCallback(() => {
    setDraftVersionIds([]);
    setDraftNewArtifact(true);
  }, []);

  const handleApply = useCallback(() => {
    if (!draftNewArtifact && draftVersionIds.length === 0) return;

    const nextSelection: RelatedArtifactSelection =
      draftNewArtifact && draftVersionIds.length === 0
        ? { type: "new" }
        : { type: "versions", versionIds: draftVersionIds };

    onSelectionChange(nextSelection);
    setOpen(false);
    triggerRef.current?.focus();
  }, [draftNewArtifact, draftVersionIds, onSelectionChange]);

  const controlClass = [
    selectStyles.control,
    selectStyles["size-sm"],
    disabled ? selectStyles.disabled : "",
    open ? selectStyles.open : "",
    isFilled && !disabled ? selectStyles.filled : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={selectStyles.root}>
      <label htmlFor={id} className={selectStyles.label}>
        {label}
      </label>
      <div className={selectStyles.wrapper}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-disabled={disabled}
          disabled={disabled}
          className={controlClass}
          onClick={() => {
            if (disabled) return;
            setOpen((current) => !current);
          }}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen(true);
            }
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          <span
            className={
              displayLabel ? selectStyles.valueText : selectStyles.placeholderText
            }
          >
            {displayLabel || placeholder}
          </span>
          <Icon
            name={open ? "chevron-up" : "chevron-down"}
            size={14}
            className={selectStyles.chevron}
            aria-hidden="true"
          />
        </button>

        <Menu
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          portal
          portalZIndex={9999}
          align="left"
          aria-label="Related artifact options"
          className={styles.menuShell}
          footerSlot={
            <RelatedArtifactMenuFooter
              applyDisabled={applyDisabled}
              onApply={handleApply}
              onReset={handleReset}
            />
          }
        >
          <RelatedArtifactMenuItems
            options={options}
            draftVersionIds={draftVersionIds}
            draftNewArtifact={draftNewArtifact}
            onToggleVersion={handleToggleVersion}
            onSelectNewArtifact={handleSelectNewArtifact}
          />
        </Menu>
      </div>
    </div>
  );
}
