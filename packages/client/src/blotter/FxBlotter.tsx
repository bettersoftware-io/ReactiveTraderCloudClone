import { useCallback, useMemo, useRef, useState } from "react";
import type { Trade } from "@rtc/domain";
import { useHooks } from "../ui/hooks/HooksProvider";
import { COLUMNS } from "./blotterColumns";
import { BlotterHeader } from "./BlotterHeader";
import { BlotterRow } from "./BlotterRow";
import { QuickFilter } from "./QuickFilter";
import { exportToCsv } from "./csvExport";
import {
  type SortState,
  nextSortDirection,
  applySortToTrades,
} from "./columnSort";
import {
  type ColumnFilter,
  applyFilters,
} from "./columnFilter/filterState";

export function FxBlotter() {
  const trades = useHooks().useTrades();
  const [sort, setSort] = useState<SortState>({ column: null, direction: null });
  const [filters, setFilters] = useState<Map<keyof Trade, ColumnFilter>>(new Map());
  const [quickFilter, setQuickFilter] = useState("");
  const seenTradeIds = useRef(new Set<number>());

  // Track which trades are "new" (appeared after initial load)
  const newTradeIds = useMemo(() => {
    const newIds = new Set<number>();
    for (const trade of trades) {
      if (!seenTradeIds.current.has(trade.tradeId)) {
        // Only mark as new if we've seen at least one snapshot
        if (seenTradeIds.current.size > 0) {
          newIds.add(trade.tradeId);
        }
        seenTradeIds.current.add(trade.tradeId);
      }
    }
    return newIds;
  }, [trades]);

  const handleSort = useCallback(
    (column: keyof Trade) => {
      setSort((prev) => nextSortDirection(column, prev));
    },
    [],
  );

  const handleFilter = useCallback(
    (column: keyof Trade, filter: ColumnFilter | null) => {
      setFilters((prev) => {
        const next = new Map(prev);
        if (filter) next.set(column, filter);
        else next.delete(column);
        return next;
      });
    },
    [],
  );

  const processedTrades = useMemo(() => {
    const filtered = applyFilters(trades, filters, quickFilter);
    return applySortToTrades(filtered, sort);
  }, [trades, filters, quickFilter, sort]);

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    for (const [key, filter] of filters) {
      const col = COLUMNS.find((c) => c.key === key);
      if (col) labels.push(col.label);
      void filter;
    }
    return labels;
  }, [filters]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        backgroundColor: "var(--bg-tile)",
        border: "1px solid var(--border-primary)",
        borderRadius: 6,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            Trades
          </span>
          <QuickFilter value={quickFilter} onChange={setQuickFilter} />
          {activeFilterLabels.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Filtered: {activeFilterLabels.join(", ")}
            </span>
          )}
        </div>
        <button
          data-testid="export-csv"
          onClick={() => exportToCsv(processedTrades)}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            border: "1px solid var(--border-primary)",
            borderRadius: 3,
            backgroundColor: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          Export CSV
        </button>
      </div>

      <div style={{ overflow: "auto", maxHeight: 300 }}>
        <table
          data-testid="blotter-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <BlotterHeader
              sort={sort}
              onSort={handleSort}
              filters={filters}
              onFilter={handleFilter}
              trades={trades}
            />
          </thead>
          <tbody>
            {processedTrades.map((trade) => (
              <BlotterRow
                key={trade.tradeId}
                trade={trade}
                isNew={newTradeIds.has(trade.tradeId)}
              />
            ))}
            {processedTrades.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  style={{
                    padding: 16,
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 12,
                  }}
                >
                  {trades.length === 0
                    ? "No trades yet"
                    : "No trades match the current filters"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
