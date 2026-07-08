import type { CSSProperties, ReactElement } from "react";
import { useEffect, useState } from "react";

import { type CreditTrade, Direction } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { useCreditView } from "#/ui/credit/useCreditView";
import { BlotterHeader } from "#/ui/fx/blotter/BlotterHeader";
import type { ColumnFilter } from "#/ui/fx/blotter/columnFilter/filterState";
import { applyFilters } from "#/ui/fx/blotter/columnFilter/filterState";
import {
  applySort,
  nextSortDirection,
  type SortState,
} from "#/ui/fx/blotter/columnSort";
import { exportToCsv } from "#/ui/fx/blotter/csvExport";

import {
  CREDIT_COLUMNS,
  CREDIT_CSV_UNFORMATTED,
  CREDIT_DESC_FIRST,
  formatCreditCell,
} from "./creditBlotterColumns";
import { deriveCreditTrades } from "./creditTradesVm";

import styles from "./CreditBlotter.module.css";

export function CreditBlotter(): ReactElement {
  const { useRfqs, useAllQuotes, useInstruments, useDealers } = useViewModel();
  const rfqs = useRfqs();
  const allQuotes = useAllQuotes();
  const instruments = useInstruments();
  const dealers = useDealers();

  const [sort, setSort] = useState<SortState<CreditTrade>>({
    column: null,
    direction: null,
  });
  const [filters, setFilters] = useState<
    Map<keyof CreditTrade, ColumnFilter<CreditTrade>>
  >(new Map());
  const { quickFilter, setExportCsvHandler } = useCreditView();

  const trades = deriveCreditTrades(rfqs, allQuotes, instruments, dealers);

  // PROTO CreditScreen newCreditId / useCreditRfqs's timer-cleared flash
  // window, re-derived without a clock: src/ui may not schedule timers or read
  // the wall clock (tests/scripts/grep-gates.ts gate 29 and siblings — see
  // rfqCardAnim.ts for the fuller-featured version of this same technique).
  // A trade id absent from the previous render's FULL id set is "just booked"
  // for exactly one id-set change; React's "adjust state during render"
  // pattern (react.dev) folds the previous snapshot forward the instant the
  // id set changes, so the CSS entrance animation (gated on data-new, one-shot
  // by construction) plays once per newly-booked trade with no timer to clear.
  const tradeIds = trades.map((t) => {
    return t.tradeId;
  });
  const tradeIdsKey = tradeIds.join(",");
  const [prevTradeIds, setPrevTradeIds] = useState<TradeIdSnapshot>(() => {
    return { key: tradeIdsKey, ids: new Set(tradeIds) };
  });
  const [newTradeIds, setNewTradeIds] = useState<ReadonlySet<number>>(
    new Set(),
  );

  if (tradeIdsKey !== prevTradeIds.key) {
    const justAppeared = tradeIds.filter((id) => {
      return !prevTradeIds.ids.has(id);
    });
    setNewTradeIds(new Set(justAppeared));
    setPrevTradeIds({ key: tradeIdsKey, ids: new Set(tradeIds) });
  }

  function handleSort(column: keyof CreditTrade): void {
    setSort((prev) => {
      return nextSortDirection(column, prev, CREDIT_DESC_FIRST);
    });
  }

  function handleFilter(
    column: keyof CreditTrade,
    filter: ColumnFilter<CreditTrade> | null,
  ): void {
    setFilters((prev) => {
      const next = new Map(prev);
      if (filter) next.set(column, filter);
      else next.delete(column);
      return next;
    });
  }

  const filtered = applyFilters(trades, filters, quickFilter);
  const processedTrades = applySort(filtered, sort);

  // The CSV chip lives in CreditBlotterHead now (mirrors FxBlotter's Task 12
  // handoff); it calls exportCsv() from context, which invokes whatever
  // handler was last registered here — bound to the current filtered/sorted
  // rows.
  useEffect(() => {
    setExportCsvHandler(() => {
      // PROTO useCreditRfqs.ts downloadCsv("credit-trades.csv", …).
      exportToCsv(
        processedTrades,
        CREDIT_COLUMNS,
        formatCreditCell,
        "credit-trades.csv",
        CREDIT_CSV_UNFORMATTED,
      );
    });
  }, [processedTrades, setExportCsvHandler]);

  const activeFilterLabels: string[] = [];

  for (const key of filters.keys()) {
    const col = CREDIT_COLUMNS.find((c) => {
      return c.key === key;
    });
    if (col) activeFilterLabels.push(col.label);
  }

  return (
    <div className={styles.blotter}>
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
              columns={CREDIT_COLUMNS}
            />
          </thead>
          <tbody>
            {processedTrades.map((trade) => {
              const acc = rowAccentVar(trade.direction);

              return (
                <tr
                  key={trade.tradeId}
                  data-new={newTradeIds.has(trade.tradeId) ? "true" : undefined}
                  data-dir={trade.direction}
                  className={styles.row}
                  // eslint-disable-next-line no-restricted-syntax -- runtime direction accent via CSS custom property; static CSS can't express it
                  style={{ "--row-acc": acc } as CSSProperties}
                >
                  {CREDIT_COLUMNS.map((col) => {
                    return (
                      <td key={String(col.key)} className={styles.cell}>
                        {formatCreditCell(trade, col)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {processedTrades.length === 0 && (
              <tr>
                <td
                  colSpan={CREDIT_COLUMNS.length}
                  className={styles.emptyCell}
                >
                  {trades.length === 0
                    ? "No credit trades yet"
                    : "No credit trades match the current filters"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// PROTO Blotter/CreditBlotterPanel.tsx rowAccent(): the entrance flash's
// accent colour — the trade's own Buy/Sell direction, mapped to this app's
// positive/negative accent tokens (PROTO's flat --buy/--sell equivalents).
function rowAccentVar(direction: Direction): string {
  return direction === Direction.Buy
    ? "var(--accent-positive)"
    : "var(--accent-negative)";
}

/** A trade-id-set snapshot, taken across renders to detect "just booked"
 * arrivals (see the new-trade flash comment above). */
interface TradeIdSnapshot {
  key: string;
  ids: ReadonlySet<number>;
}
