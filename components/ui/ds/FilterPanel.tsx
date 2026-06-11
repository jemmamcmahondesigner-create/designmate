'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import styles from './FilterPanel.module.css';

export type FilterPanelAllRow = {
  id: string;
  label?: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
};

export type FilterPanelCheckboxItem = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export type FilterPanelPersonItem = {
  id: string;
  name: string;
  initials: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export type FilterPanelGroup = {
  id: string;
  heading: string;
  allRow?: FilterPanelAllRow;
  items?: FilterPanelCheckboxItem[];
  people?: FilterPanelPersonItem[];
};

export type FilterPanelProps = {
  idPrefix?: string;
  /** Optional global "All" row rendered above the first group heading. */
  topAllRow?: FilterPanelAllRow;
  groups: FilterPanelGroup[];
  resetDisabled?: boolean;
  onReset: () => void;
  applyDisabled?: boolean;
  onApply: () => void;
  className?: string;
  style?: CSSProperties;
  footer?: ReactNode;
};

export function FilterPanel({
  idPrefix = 'filter-panel',
  topAllRow,
  groups,
  resetDisabled = false,
  onReset,
  applyDisabled = false,
  onApply,
  className,
  style,
  footer,
}: FilterPanelProps) {
  const panelClass = [styles.panel, className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={panelClass} style={style} role="dialog" aria-label="Filter">
      <div className={styles.body}>
        {topAllRow ? (
          <div className={styles.rows}>
            <div className={`${styles.row} ${styles.rowAll}`}>
              <Checkbox
                id={`${idPrefix}-${topAllRow.id}`}
                label={topAllRow.label ?? 'All'}
                checked={topAllRow.checked}
                indeterminate={topAllRow.indeterminate}
                onChange={topAllRow.onChange}
              />
            </div>
          </div>
        ) : null}

        {groups.map((group) => (
          <div key={group.id}>
            <div className={styles.headingWrap}>
              <span className={styles.heading}>{group.heading}</span>
            </div>
            <div className={styles.rows}>
              {group.allRow ? (
                <div className={`${styles.row} ${styles.rowAll}`}>
                  <Checkbox
                    id={`${idPrefix}-${group.allRow.id}`}
                    label={group.allRow.label ?? 'All'}
                    checked={group.allRow.checked}
                    indeterminate={group.allRow.indeterminate}
                    onChange={group.allRow.onChange}
                  />
                </div>
              ) : null}
              {group.items?.map((item) => (
                <div key={item.id} className={styles.row}>
                  <Checkbox
                    id={`${idPrefix}-${item.id}`}
                    label={item.label}
                    checked={item.checked}
                    onChange={item.onChange}
                  />
                </div>
              ))}
              {group.people?.map((person) => (
                <div key={person.id} className={styles.rowReviewer}>
                  <Checkbox
                    id={`${idPrefix}-${person.id}`}
                    label=""
                    checked={person.checked}
                    onChange={person.onChange}
                  />
                  <span className={styles.reviewerChip}>{person.initials}</span>
                  <span className={styles.reviewerName}>{person.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        {footer ?? (
          <>
            <Button
              label="Reset"
              size="sm"
              variant="ghost"
              disabled={resetDisabled}
              onClick={onReset}
            />
            <Button
              label="Apply"
              size="sm"
              variant="primary"
              style={{ minWidth: 72 }}
              disabled={applyDisabled}
              onClick={onApply}
            />
          </>
        )}
      </div>
    </div>
  );
}
