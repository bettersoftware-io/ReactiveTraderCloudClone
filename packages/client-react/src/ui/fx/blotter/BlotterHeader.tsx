import type { MouseEvent, ReactElement } from "react";
import { useState } from "react";

import type { ColumnFilter, SortState } from "@rtc/client-core";

import type { ColumnDef } from "./blotterColumns";
import { DateFilter } from "./columnFilter/DateFilter";
import { NumberFilter } from "./columnFilter/NumberFilter";
import { SetFilter } from "./columnFilter/SetFilter";

import styles from "./BlotterHeader.module.css";

export function BlotterHeader<TRow>({
  sort,
  onSort,
  filters,
  onFilter,
  rows,
  columns,
}: BlotterHeaderProps<TRow>): ReactElement {
  const [openFilter, setOpenFilter] = useState<keyof TRow | null>(null);

  return (
    <tr>
      {columns.map((col) => {
        return (
          <th
            key={String(col.key)}
            data-testid={`blotter-sort-${String(col.key)}`}
            className={styles.headerCell}
            aria-sort={ariaSortFor(col.key, sort)}
            onClick={() => {
              return onSort(col.key);
            }}
          >
            <span>
              {col.label}
              <SortIndicator column={col.key} sort={sort} />
              {filters.has(col.key) && (
                <span className={styles.filterDot}>{"●"}</span>
              )}
            </span>
            <button
              type="button"
              data-testid={`blotter-filter-toggle-${String(col.key)}`}
              onClick={(e: MouseEvent<HTMLButtonElement>): void => {
                e.stopPropagation();
                setOpenFilter(openFilter === col.key ? null : col.key);
              }}
              className={styles.filterToggle}
            >
              {"▽"}
            </button>
            {openFilter === col.key && (
              <FilterPanel
                col={col}
                rows={rows}
                currentFilter={filters.get(col.key)}
                onApply={(f: ColumnFilter<TRow> | null): void => {
                  onFilter(col.key, f);
                }}
                onClose={() => {
                  return setOpenFilter(null);
                }}
              />
            )}
          </th>
        );
      })}
    </tr>
  );
}

interface BlotterHeaderProps<TRow> {
  sort: SortState<TRow>;
  onSort: (column: keyof TRow) => void;
  filters: Map<keyof TRow, ColumnFilter<TRow>>;
  onFilter: (column: keyof TRow, filter: ColumnFilter<TRow> | null) => void;
  rows: readonly TRow[];
  columns: readonly ColumnDef<TRow>[];
}

function ariaSortFor<TRow>(
  column: keyof TRow,
  sort: SortState<TRow>,
): "ascending" | "descending" | undefined {
  if (sort.column !== column || !sort.direction) {
    return undefined;
  }

  return sort.direction === "asc" ? "ascending" : "descending";
}

interface SortIndicatorProps<TRow> {
  column: keyof TRow;
  sort: SortState<TRow>;
}

function SortIndicator<TRow>({
  column,
  sort,
}: SortIndicatorProps<TRow>): ReactElement | null {
  if (sort.column !== column || !sort.direction) {
    return null;
  }

  return (
    <span className={styles.sortIndicator}>
      {sort.direction === "asc" ? "▲" : "▼"}
    </span>
  );
}

interface FilterPanelProps<TRow> {
  col: ColumnDef<TRow>;
  rows: readonly TRow[];
  currentFilter: ColumnFilter<TRow> | undefined;
  onApply: (filter: ColumnFilter<TRow> | null) => void;
  onClose: () => void;
}

function FilterPanel<TRow>({
  col,
  rows,
  currentFilter,
  onApply,
  onClose,
}: FilterPanelProps<TRow>): ReactElement {
  function handleApply(filter: ColumnFilter<TRow> | null): void {
    onApply(filter);
    onClose();
  }

  return (
    <div className={styles.filterPanel}>
      {col.filterType === "set" && (
        <SetFilter
          column={col.key}
          rows={rows}
          currentFilter={currentFilter}
          onApply={handleApply}
        />
      )}
      {col.filterType === "number" && (
        <NumberFilter
          column={col.key}
          currentFilter={currentFilter}
          onApply={handleApply}
        />
      )}
      {col.filterType === "date" && (
        <DateFilter
          column={col.key}
          currentFilter={currentFilter}
          onApply={handleApply}
        />
      )}
    </div>
  );
}
