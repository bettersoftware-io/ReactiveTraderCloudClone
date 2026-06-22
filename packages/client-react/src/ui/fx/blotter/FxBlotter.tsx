import type { Trade } from "@rtc/domain";
import { useCallback, useMemo, useRef, useState } from "react";
import styles from "./FxBlotter.module.css";
import { useHooks } from "../../hooks/useHooks";
import { BlotterHeader } from "./BlotterHeader";
import { BlotterRow } from "./BlotterRow";
import { COLUMNS } from "./blotterColumns";
import { applyFilters, type ColumnFilter } from "./columnFilter/filterState";
import {
  applySortToTrades,
  nextSortDirection,
  type SortState,
} from "./columnSort";
import { exportToCsv } from "./csvExport";
import { QuickFilter } from "./QuickFilter";

export function FxBlotter() {
  const trades = useHooks().useTrades();
  const [sort, setSort] = useState<SortState>({
    column: null,
    direction: null,
  });
  const [filters, setFilters] = useState<Map<keyof Trade, ColumnFilter>>(
    new Map(),
  );
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

  const handleSort = useCallback((column: keyof Trade) => {
    setSort((prev) => nextSortDirection(column, prev));
  }, []);

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
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.title}>Trades</span>
          <QuickFilter value={quickFilter} onChange={setQuickFilter} />
          {activeFilterLabels.length > 0 && (
            <span className={styles.filterLabel}>
              Filtered: {activeFilterLabels.join(", ")}
            </span>
          )}
        </div>
        <button
          type="button"
          data-testid="export-csv"
          onClick={() => exportToCsv(processedTrades)}
          className={styles.exportBtn}
        >
          Export CSV
        </button>
      </div>

      <div className={styles.tableWrapper}>
        <table data-testid="blotter-table" className={styles.table}>
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
                <td colSpan={COLUMNS.length} className={styles.emptyCell}>
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
