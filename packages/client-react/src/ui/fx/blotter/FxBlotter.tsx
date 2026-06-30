import type { ReactElement } from "react";
import { useState } from "react";

import type { Trade } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { BlotterHeader } from "./BlotterHeader";
import { BlotterRow } from "./BlotterRow";
import { COLUMNS, formatFxCell } from "./blotterColumns";
import { applyFilters, type ColumnFilter } from "./columnFilter/filterState";
import {
  applySortToTrades,
  nextSortDirection,
  type SortState,
} from "./columnSort";
import { exportFxToCsv } from "./csvExport";
import { QuickFilter } from "./QuickFilter";

import styles from "./FxBlotter.module.css";

export function FxBlotter(): ReactElement {
  const { useTrades, useNewTradeIds } = useViewModel();
  const trades = useTrades();
  // "Newly arrived" detection is a cross-emission stream-diff; it lives in the
  // presenter (BlotterPresenter.newTradeIds$), not here — see docs/adr/ADR-003.
  const newTradeIds = useNewTradeIds();
  const [sort, setSort] = useState<SortState<Trade>>({
    column: null,
    direction: null,
  });
  const [filters, setFilters] = useState<Map<keyof Trade, ColumnFilter<Trade>>>(
    new Map(),
  );
  const [quickFilter, setQuickFilter] = useState("");

  function handleSort(column: keyof Trade): void {
    setSort((prev) => {
      return nextSortDirection(column, prev);
    });
  }

  function handleFilter(
    column: keyof Trade,
    filter: ColumnFilter<Trade> | null,
  ): void {
    setFilters((prev) => {
      const next = new Map(prev);
      if (filter) next.set(column, filter);
      else next.delete(column);
      return next;
    });
  }

  const filtered = applyFilters(trades, filters, quickFilter);
  const processedTrades = applySortToTrades(filtered, sort);

  const activeFilterLabels: string[] = [];

  for (const key of filters.keys()) {
    const col = COLUMNS.find((c) => {
      return c.key === key;
    });
    if (col) activeFilterLabels.push(col.label);
  }

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
          onClick={() => {
            return exportFxToCsv(processedTrades);
          }}
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
              rows={trades}
              columns={COLUMNS}
            />
          </thead>
          <tbody>
            {processedTrades.map((trade) => {
              return (
                <BlotterRow
                  key={trade.tradeId}
                  trade={trade}
                  isNew={newTradeIds.has(trade.tradeId)}
                  columns={COLUMNS}
                  format={formatFxCell}
                />
              );
            })}
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
