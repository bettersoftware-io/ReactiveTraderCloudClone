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

  function sortByColumn(column: keyof TRow) {
    return () => {
      onSort(column);
    };
  }

  function toggleFilterPanelFor(column: keyof TRow) {
    return (e: MouseEvent<HTMLButtonElement>): void => {
      e.stopPropagation();
      setOpenFilter(openFilter === column ? null : column);
    };
  }

  function applyFilterFor(column: keyof TRow) {
    return (f: ColumnFilter<TRow> | null): void => {
      onFilter(column, f);
    };
  }

  function closeFilter(): void {
    setOpenFilter(null);
  }

  return (
    <tr>
      {columns.map((col) => {
        return (
          <th
            key={String(col.key)}
            data-testid={`blotter-sort-${String(col.key)}`}
            className={styles.headerCell}
            aria-sort={ariaSortFor(col.key, sort)}
            onClick={sortByColumn(col.key)}
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
              onClick={toggleFilterPanelFor(col.key)}
              className={styles.filterToggle}
            >
              {"▽"}
            </button>
            {openFilter === col.key && (
              <FilterPanel
                col={col}
                rows={rows}
                currentFilter={filters.get(col.key)}
                onApply={applyFilterFor(col.key)}
                onClose={closeFilter}
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
  function commitColumnFilter(filter: ColumnFilter<TRow> | null): void {
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
          onApply={commitColumnFilter}
        />
      )}
      {col.filterType === "number" && (
        <NumberFilter
          column={col.key}
          currentFilter={currentFilter}
          onApply={commitColumnFilter}
        />
      )}
      {col.filterType === "date" && (
        <DateFilter
          column={col.key}
          currentFilter={currentFilter}
          onApply={commitColumnFilter}
        />
      )}
    </div>
  );
}
