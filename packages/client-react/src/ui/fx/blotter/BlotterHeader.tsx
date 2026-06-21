import { useCallback, useState } from "react";
import type { Trade } from "@rtc/domain";
import { COLUMNS, type ColumnDef } from "./blotterColumns";
import type { SortState } from "./columnSort";
import type { ColumnFilter } from "./columnFilter/filterState";
import { SetFilter } from "./columnFilter/SetFilter";
import { NumberFilter } from "./columnFilter/NumberFilter";
import { DateFilter } from "./columnFilter/DateFilter";
import styles from "./BlotterHeader.module.css";

interface BlotterHeaderProps {
  sort: SortState;
  onSort: (column: keyof Trade) => void;
  filters: Map<keyof Trade, ColumnFilter>;
  onFilter: (column: keyof Trade, filter: ColumnFilter | null) => void;
  trades: readonly Trade[];
}

function SortIndicator({ column, sort }: { column: keyof Trade; sort: SortState }) {
  if (sort.column !== column || !sort.direction) return null;
  return <span className={styles.sortIndicator}>{sort.direction === "asc" ? "▲" : "▼"}</span>;
}

function FilterPanel({
  col,
  trades,
  currentFilter,
  onApply,
  onClose,
}: {
  col: ColumnDef;
  trades: readonly Trade[];
  currentFilter: ColumnFilter | undefined;
  onApply: (filter: ColumnFilter | null) => void;
  onClose: () => void;
}) {
  const handleApply = useCallback(
    (filter: ColumnFilter | null) => {
      onApply(filter);
      onClose();
    },
    [onApply, onClose],
  );

  return (
    <div className={styles.filterPanel}>
      {col.filterType === "set" && (
        <SetFilter column={col.key} trades={trades} currentFilter={currentFilter} onApply={handleApply} />
      )}
      {col.filterType === "number" && (
        <NumberFilter column={col.key} currentFilter={currentFilter} onApply={handleApply} />
      )}
      {col.filterType === "date" && (
        <DateFilter column={col.key} currentFilter={currentFilter} onApply={handleApply} />
      )}
    </div>
  );
}

export function BlotterHeader({
  sort,
  onSort,
  filters,
  onFilter,
  trades,
}: BlotterHeaderProps) {
  const [openFilter, setOpenFilter] = useState<keyof Trade | null>(null);

  return (
    <tr>
      {COLUMNS.map((col) => (
        <th
          key={col.key}
          data-testid={`blotter-sort-${col.key}`}
          className={styles.headerCell}
          onClick={() => onSort(col.key)}
        >
          <span>
            {col.label}
            <SortIndicator column={col.key} sort={sort} />
            {filters.has(col.key) && (
              <span className={styles.filterDot}>{"●"}</span>
            )}
          </span>
          <button
            data-testid={`blotter-filter-toggle-${col.key}`}
            onClick={(e) => {
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
              trades={trades}
              currentFilter={filters.get(col.key)}
              onApply={(f) => onFilter(col.key, f)}
              onClose={() => setOpenFilter(null)}
            />
          )}
        </th>
      ))}
    </tr>
  );
}
