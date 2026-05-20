'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './Icon';
import { IconSquareButton } from './IconSquareButton';
import { Menu, MenuItem } from './Menu';
import styles from './Table.module.css';

export type TableCellType =
  | 'text'
  | 'text-bold'
  | 'link'
  | 'status'
  | 'avatar'
  | 'badge'
  | 'kebab'
  | 'custom';

export type ColumnRenderContext = {
  selected: boolean;
};

export type ColumnDef<T> = {
  key: string;
  label: string;
  width?: number | 'flex';
  align?: 'left' | 'right' | 'center';
  cellType?: TableCellType;
  /** When true, no vertical rule after this header cell (e.g. custom layouts). Last column never shows a divider. */
  noHeaderDivider?: boolean;
  render: (row: T, context: ColumnRenderContext) => ReactNode;
};

export type TablePageSizeOption = 10 | 20 | 40 | 80 | 'all';

export type TablePagination = {
  totalCount: number;
  pageSize: number;
  pageIndex: number;
  onPrev: () => void;
  onNext: () => void;
  pageSizeOptions?: TablePageSizeOption[];
  pageSizeValue?: TablePageSizeOption;
  onPageSizeChange?: (size: TablePageSizeOption) => void;
};

export type TableProps<T extends { id: string }> = {
  columns: ColumnDef<T>[];
  rows: T[];
  selectedRowId?: string;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  className?: string;
  pagination?: TablePagination;
  isRowMuted?: (row: T) => boolean;
};

function pageSizeLabel(size: TablePageSizeOption): string {
  return size === 'all' ? 'All' : String(size);
}

function TableFooterRowsPerPage({
  value,
  options,
  onChange,
}: {
  value: TablePageSizeOption;
  options: TablePageSizeOption[];
  onChange: (size: TablePageSizeOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.footerRowsPerPageTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Rows per page: {pageSizeLabel(value)}{' '}
        <Icon name="chevron-down" size={12} aria-hidden />
      </button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        align="right"
        portal
        portalZIndex={100}
        aria-label="Rows per page"
      >
        {options.map((option) => (
          <MenuItem
            key={String(option)}
            label={pageSizeLabel(option)}
            active={option === value}
            onClick={() => {
              onChange(option);
              setOpen(false);
            }}
          />
        ))}
      </Menu>
    </>
  );
}

export function Table<T extends { id: string }>({
  columns,
  rows,
  selectedRowId,
  onRowClick,
  emptyState,
  className,
  pagination,
  isRowMuted,
}: TableProps<T>) {
  const wrapClass = [styles.wrap, className ?? ''].filter(Boolean).join(' ');
  const tableClass = styles.table;

  if (rows.length === 0 && emptyState) {
    return (
      <div className={wrapClass}>
        <div className={styles.empty}>{emptyState}</div>
      </div>
    );
  }

  const showFooter = Boolean(pagination) && pagination!.totalCount > 0;

  const rangeStart =
    pagination && pagination.totalCount > 0
      ? pagination.pageIndex * pagination.pageSize + 1
      : 0;
  const rangeEnd =
    pagination && pagination.totalCount > 0
      ? Math.min(
          pagination.totalCount,
          (pagination.pageIndex + 1) * pagination.pageSize,
        )
      : 0;
  const disablePrev = !pagination || pagination.pageIndex <= 0;
  const disableNext =
    !pagination ||
    (pagination.pageIndex + 1) * pagination.pageSize >= pagination.totalCount;

  const pageSizeOptions = pagination?.pageSizeOptions;
  const pageSizeValue = pagination?.pageSizeValue ?? pagination?.pageSize ?? 10;

  return (
    <div className={wrapClass}>
      <table className={tableClass}>
        <colgroup>
          {columns.map((col) => (
            <col
              key={col.key}
              style={
                col.width === 'flex' || col.width == null
                  ? undefined
                  : { width: col.width, minWidth: col.width }
              }
            />
          ))}
        </colgroup>
        <thead>
          <tr className={styles.theadRow}>
            {columns.map((column, index) => {
              const isLast = index === columns.length - 1;
              const showHeaderDivider = !isLast && !column.noHeaderDivider;
              const headerLabelWrapStyle: CSSProperties = {
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  column.align === 'right'
                    ? 'flex-end'
                    : column.align === 'center'
                      ? 'center'
                      : 'flex-start',
                textAlign:
                  column.align === 'right'
                    ? 'right'
                    : column.align === 'center'
                      ? 'center'
                      : 'left',
              };
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={{
                    width:
                      column.width === 'flex' || column.width == null
                        ? undefined
                        : column.width,
                  }}
                >
                  <div className={styles.headerCellWrap}>
                    <div
                      className={styles.headerLabelWrap}
                      style={headerLabelWrapStyle}
                    >
                      <span className={styles.headerLabel}>{column.label}</span>
                    </div>
                    {showHeaderDivider ? (
                      <div className={styles.headerDividerOuter} aria-hidden>
                        <div className={styles.headerDividerTrack}>
                          <div className={styles.headerDividerRotate}>
                            <div className={styles.headerDividerBar} />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = selectedRowId === row.id;
            const muted = isRowMuted?.(row) ?? false;
            const rowClass = [
              styles.row,
              selected ? styles.rowSelected : '',
              muted ? styles.rowMuted : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <tr
                key={row.id}
                className={rowClass}
                onClick={() => onRowClick?.(row)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick?.(row);
                  }
                }}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => {
                  const type = column.cellType ?? 'custom';

                  return (
                    <td
                      key={`${row.id}-${column.key}`}
                      className={[
                        column.align === 'right' || type === 'kebab'
                          ? styles.alignRight
                          : column.align === 'center'
                            ? styles.alignCenter
                            : '',
                        type === 'kebab' ? styles.kebabTd : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={
                        type === 'kebab'
                          ? (event) => event.stopPropagation()
                          : undefined
                      }
                    >
                      {renderCell(column, row, selected)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {showFooter ? (
        <div className={styles.footer}>
          <div className={styles.footerMeta}>
            {pageSizeOptions && pagination?.onPageSizeChange ? (
              <TableFooterRowsPerPage
                value={pageSizeValue as TablePageSizeOption}
                options={pageSizeOptions}
                onChange={pagination.onPageSizeChange}
              />
            ) : (
              <span className={styles.footerRowsPerPage}>
                Rows per page: {pagination!.pageSize}{' '}
                <Icon name="chevron-down" size={12} aria-hidden />
              </span>
            )}
            <span className={styles.footerRange}>
              {pagination!.totalCount === 0
                ? '0–0 of 0'
                : `${rangeStart}–${rangeEnd} of ${pagination!.totalCount}`}
            </span>
          </div>
          <span className={styles.footerNav}>
            <IconSquareButton
              icon="chevron-left"
              label="Previous page"
              disabled={disablePrev}
              onClick={() => pagination!.onPrev()}
            />
            <IconSquareButton
              icon="chevron-right"
              label="Next page"
              disabled={disableNext}
              onClick={() => pagination!.onNext()}
            />
          </span>
        </div>
      ) : null}
    </div>
  );
}

function renderCell<T extends { id: string }>(
  column: ColumnDef<T>,
  row: T,
  selected: boolean,
): ReactNode {
  const type = column.cellType ?? 'custom';
  const raw = column.render(row, { selected });

  switch (type) {
    case 'text':
      return <span className={styles.cellText}>{raw}</span>;
    case 'text-bold': {
      const cls = [
        styles.cellTextBold,
        selected ? styles.cellTextBoldSelected : '',
      ]
        .filter(Boolean)
        .join(' ');
      return <span className={cls}>{raw}</span>;
    }
    case 'link':
      return <span className={styles.cellLink}>{raw}</span>;
    case 'kebab':
      return <span className={styles.kebabCell}>{raw}</span>;
    case 'status':
    case 'badge':
      return <span className={styles.cellPill}>{raw}</span>;
    case 'avatar':
    case 'custom':
    default:
      return <span className={styles.cellCustom}>{raw}</span>;
  }
}
