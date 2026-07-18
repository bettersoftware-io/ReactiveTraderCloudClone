import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import {
  applyFilters,
  applySortToTrades,
  type ColumnFilter,
  nextSortDirection,
  type SortState,
} from "@rtc/client-core";
import type { Trade } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { useFxView } from "#/ui/fx/useFxView";

import { ActivityView } from "./ActivityView";
import { BlotterColgroup } from "./BlotterColgroup";
import { BlotterHeader } from "./BlotterHeader";
import { BlotterRow } from "./BlotterRow";
import { COLUMNS, formatFxCell } from "./blotterColumns";
import { exportFxToCsv } from "./csvExport";

import styles from "./FxBlotter.module.css";

export function FxBlotter(): ReactElement {
  const { useTrades, useNewTradeIds, useActivity } = useViewModel();
  const trades = useTrades();
  // "Newly arrived" detection is a cross-emission stream-diff; it lives in the
  // presenter (BlotterPresenter.newTradeIds$), not here — see docs/adr/ADR-003.
  const newTradeIds = useNewTradeIds();
  // Same story for the Activity feed's live/seed split and receipt-time
  // stamping — BlotterPresenter.activity$, not here.
  const activity = useActivity();
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

      if (filter) {
        next.set(column, filter);
      } else {
        next.delete(column);
      }

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

    if (col) {
      activeFilterLabels.push(col.label);
    }
  }

  if (blotterTab === "activity") {
    return (
      <div className={styles.blotter}>
        <ActivityView entries={activity} />
      </div>
    );
  }

  // Split-header structure (shared with CreditBlotter): the column-header
  // table is a fixed region ABOVE the scrolling rows region, so the header
  // stays put while rows scroll AND BlotterHeader's filter popover anchors
  // outside any scroll clip (position:sticky on thead/th breaks the popover's
  // hit-testing in real Chromium — see CreditBlotter.module.css). The shared
  // BlotterColgroup + table-layout:fixed keep the two tables' column edges
  // aligned exactly.
  return (
    <div data-testid="blotter-table" className={styles.blotter}>
      {activeFilterLabels.length > 0 && (
        <span className={styles.filterLabel}>
          Filtered: {activeFilterLabels.join(", ")}
        </span>
      )}

      <div className={styles.headerRegion}>
        <table className={styles.table}>
          <BlotterColgroup columns={COLUMNS} />
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
        </table>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <BlotterColgroup columns={COLUMNS} />
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
