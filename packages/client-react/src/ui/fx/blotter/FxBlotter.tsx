import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import type { Trade } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { useFxView } from "#/ui/fx/useFxView";

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

import styles from "./FxBlotter.module.css";

export function FxBlotter(): ReactElement {
  const { useTrades, useNewTradeIds } = useViewModel();
  const trades = useTrades();
  // "Newly arrived" detection is a cross-emission stream-diff; it lives in the
  // presenter (BlotterPresenter.newTradeIds$), not here — see docs/adr/ADR-003.
  const newTradeIds = useNewTradeIds();
  const { blotterTab, quickFilter, setExportCsvHandler } = useFxView();
  const [sort, setSort] = useState<SortState<Trade>>({
    column: null,
    direction: null,
  });
  const [filters, setFilters] = useState<Map<keyof Trade, ColumnFilter<Trade>>>(
    new Map(),
  );

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

  // The CSV chip lives in FxBlotterHead now (Task 12); it calls exportCsv()
  // from context, which invokes whatever handler was last registered here —
  // bound to the current filtered/sorted rows.
  useEffect(() => {
    setExportCsvHandler(() => {
      exportFxToCsv(processedTrades);
    });
  }, [processedTrades, setExportCsvHandler]);

  const activeFilterLabels: string[] = [];

  for (const key of filters.keys()) {
    const col = COLUMNS.find((c) => {
      return c.key === key;
    });
    if (col) activeFilterLabels.push(col.label);
  }

  if (blotterTab === "activity") {
    return (
      <div className={styles.container}>
        <div data-testid="activity-placeholder" className={styles.placeholder}>
          ACTIVITY FEED — COMING ONLINE
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {activeFilterLabels.length > 0 && (
        <span className={styles.filterLabel}>
          Filtered: {activeFilterLabels.join(", ")}
        </span>
      )}

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
