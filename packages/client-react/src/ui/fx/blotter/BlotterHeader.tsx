import { useCallback, useState } from "react";
import type { Trade } from "@rtc/domain";
import { COLUMNS, type ColumnDef } from "./blotterColumns";
import type { SortState } from "./columnSort";
import type { ColumnFilter } from "./columnFilter/filterState";
import { SetFilter } from "./columnFilter/SetFilter";
import { NumberFilter } from "./columnFilter/NumberFilter";
import { DateFilter } from "./columnFilter/DateFilter";

interface BlotterHeaderProps {
  sort: SortState;
  onSort: (column: keyof Trade) => void;
  filters: Map<keyof Trade, ColumnFilter>;
  onFilter: (column: keyof Trade, filter: ColumnFilter | null) => void;
  trades: readonly Trade[];
}

function SortIndicator({ column, sort }: { column: keyof Trade; sort: SortState }) {
  if (sort.column !== column || !sort.direction) return null;
  return <span style={{ marginLeft: 2 }}>{sort.direction === "asc" ? "\u25B2" : "\u25BC"}</span>;
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
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        zIndex: 10,
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        borderRadius: 4,
        minWidth: 160,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
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
          style={{
            padding: "6px 8px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-secondary)",
            textAlign: "left",
            borderBottom: "1px solid var(--border-primary)",
            whiteSpace: "nowrap",
            position: "relative",
            cursor: "pointer",
            userSelect: "none",
          }}
          onClick={() => onSort(col.key)}
        >
          <span>
            {col.label}
            <SortIndicator column={col.key} sort={sort} />
            {filters.has(col.key) && (
              <span style={{ color: "var(--accent-primary)", marginLeft: 2 }}>{"\u25CF"}</span>
            )}
          </span>
          <button
            data-testid={`blotter-filter-toggle-${col.key}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenFilter(openFilter === col.key ? null : col.key);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 10,
              marginLeft: 4,
              padding: 0,
            }}
          >
            {"\u25BD"}
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
