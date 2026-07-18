import type { JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import {
  applyFilters,
  applySort,
  type ColumnFilter,
  nextSortDirection,
  type SortState,
} from "@rtc/client-core";
import { type CreditTrade, Direction } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { useCreditView } from "#/ui/credit/useCreditView";
import { BlotterColgroup } from "#/ui/fx/blotter/BlotterColgroup";
import { BlotterHeader } from "#/ui/fx/blotter/BlotterHeader";
import type { ColumnDef } from "#/ui/fx/blotter/blotterColumns";
import { exportToCsv } from "#/ui/fx/blotter/csvExport";

import {
  CREDIT_COLUMNS,
  CREDIT_CSV_UNFORMATTED,
  CREDIT_DESC_FIRST,
  formatCreditCell,
} from "./creditBlotterColumns";
import { deriveCreditTrades } from "./creditTradesVm";

import styles from "./CreditBlotter.module.css";

export function CreditBlotter(): JSX.Element {
  const { useRfqs, useAllQuotes, useInstruments, useDealers } = useViewModel();
  const rfqs = useRfqs();
  const allQuotes = useAllQuotes();
  const instruments = useInstruments();
  const dealers = useDealers();

  const [sort, setSort] = createSignal<SortState<CreditTrade>>({
    column: null,
    direction: null,
  });

  const [filters, setFilters] = createSignal<
    Map<keyof CreditTrade, ColumnFilter<CreditTrade>>
  >(new Map());
  const { quickFilter, setExportCsvHandler } = useCreditView();

  const trades = createMemo((): CreditTrade[] => {
    return deriveCreditTrades(rfqs(), allQuotes(), instruments(), dealers());
  });

  // PROTO CreditScreen newCreditId / useCreditRfqs's timer-cleared flash
  // window, re-derived without a clock: src/ui may not schedule timers or
  // read the wall clock (grep-gates.ts gate 29 and siblings — see
  // rfqCardAnim.ts for the fuller-featured version of this same technique).
  // A trade id absent from the previous emission's FULL id set is "just
  // booked" for exactly one id-set change; this bookkeeping effect folds the
  // previous snapshot forward the instant the id set changes (the Solid
  // analogue of React's "adjust state during render" pattern — see
  // RfqsPanel.tsx for the fuller write-up), so the CSS entrance animation
  // (gated on data-new, one-shot by construction) plays once per newly-booked
  // trade with no timer to clear. Keyed off the narrowed `tradeIdsKey` memo,
  // not the whole `trades()` array, per the reactivity amendment.
  const tradeIds = createMemo((): number[] => {
    return trades().map((t) => {
      return t.tradeId;
    });
  });

  const tradeIdsKey = createMemo((): string => {
    return tradeIds().join(",");
  });

  let prevTradeIds: TradeIdSnapshot = {
    key: tradeIdsKey(),
    ids: new Set(tradeIds()),
  };

  const [newTradeIds, setNewTradeIds] = createSignal<ReadonlySet<number>>(
    new Set(),
  );

  createEffect(() => {
    const currentKey = tradeIdsKey();

    if (currentKey === prevTradeIds.key) {
      return;
    }

    const currentIds = tradeIds();
    const justAppeared = currentIds.filter((id) => {
      return !prevTradeIds.ids.has(id);
    });
    setNewTradeIds(new Set(justAppeared));
    prevTradeIds = { key: currentKey, ids: new Set(currentIds) };
  });

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

      if (filter) {
        next.set(column, filter);
      } else {
        next.delete(column);
      }

      return next;
    });
  }

  const filtered = createMemo((): readonly CreditTrade[] => {
    return applyFilters(trades(), filters(), quickFilter());
  });

  const processedTrades = createMemo((): readonly CreditTrade[] => {
    return applySort(filtered(), sort());
  });

  // Keyed by trade id, not the CreditTrade object itself: deriveCreditTrades
  // is a pure function that rebuilds every row as a brand-new object on each
  // recompute (even when only an unrelated RFQ changed), and `<For>` keys by
  // value identity — iterating the objects directly would tear down and
  // remount every row (restarting its `data-new` entrance flash) on any
  // unrelated blotter update. Mirrors RfqsPanel/SellSidePanel's own id-keyed
  // `<For>`, the direct analogue of React's `key={trade.tradeId}`.
  const processedTradeIds = createMemo((): number[] => {
    return processedTrades().map((t) => {
      return t.tradeId;
    });
  });

  // The CSV chip lives in CreditBlotterHead now (mirrors FxBlotter's
  // handoff); it calls exportCsv() from context, which invokes whatever
  // handler was last registered here — bound to the current filtered/sorted
  // rows.
  createEffect(() => {
    const rows = processedTrades();
    setExportCsvHandler(() => {
      // PROTO useCreditRfqs.ts downloadCsv("credit-trades.csv", …).
      exportToCsv(
        rows,
        CREDIT_COLUMNS,
        formatCreditCell,
        "credit-trades.csv",
        CREDIT_CSV_UNFORMATTED,
      );
    });
  });

  const activeFilterLabels = createMemo((): string[] => {
    const labels: string[] = [];

    for (const key of filters().keys()) {
      const col = CREDIT_COLUMNS.find((c) => {
        return c.key === key;
      });

      if (col) {
        labels.push(col.label);
      }
    }

    return labels;
  });

  // Split-header structure (shared with FxBlotter): the column-header table
  // is a fixed region ABOVE the scrolling rows region — the header stays put
  // while rows scroll, and BlotterHeader's filter popover anchors outside
  // any scroll clip. See the sticky-header note in CreditBlotter.module.css
  // for why position:sticky is not an option here.
  return (
    <div data-testid="blotter-table" class={styles.blotter}>
      <Show when={activeFilterLabels().length > 0}>
        <span class={styles.filterLabel}>
          Filtered: {activeFilterLabels().join(", ")}
        </span>
      </Show>

      <div class={styles.headerRegion}>
        <table class={styles.table}>
          <BlotterColgroup columns={CREDIT_COLUMNS} />
          <thead>
            <BlotterHeader
              sort={sort()}
              onSort={handleSort}
              filters={filters()}
              onFilter={handleFilter}
              rows={trades()}
              columns={CREDIT_COLUMNS}
            />
          </thead>
        </table>
      </div>

      <div class={styles.tableWrapper}>
        <table class={styles.table}>
          <BlotterColgroup columns={CREDIT_COLUMNS} />
          <tbody>
            <For each={processedTradeIds()}>
              {(tradeId: number) => {
                // `tradeId` is drawn from `processedTradeIds()`
                // (`processedTrades().map(t => t.tradeId)`), so the lookup
                // below always succeeds; `<Show keyed>` narrows
                // `CreditTrade | undefined` to `CreditTrade` without a
                // non-null assertion.
                const trade = createMemo((): CreditTrade | undefined => {
                  return processedTrades().find((t) => {
                    return t.tradeId === tradeId;
                  });
                });

                return (
                  <Show when={trade()} keyed>
                    {(currentTrade: CreditTrade) => {
                      const acc = createMemo((): string => {
                        return rowAccentVar(currentTrade.direction);
                      });

                      return (
                        <tr
                          data-new={
                            newTradeIds().has(tradeId) ? "true" : undefined
                          }
                          data-dir={currentTrade.direction}
                          class={styles.row}
                          // eslint-disable-next-line no-restricted-syntax -- runtime direction accent via CSS custom property; static CSS can't express it
                          style={{ "--row-acc": acc() }}
                        >
                          <For each={CREDIT_COLUMNS}>
                            {(col: ColumnDef<CreditTrade>) => {
                              return (
                                <td class={styles.cell}>
                                  {formatCreditCell(currentTrade, col)}
                                </td>
                              );
                            }}
                          </For>
                        </tr>
                      );
                    }}
                  </Show>
                );
              }}
            </For>
            <Show when={processedTrades().length === 0}>
              <tr>
                <td colSpan={CREDIT_COLUMNS.length} class={styles.emptyCell}>
                  {trades().length === 0
                    ? "No credit trades yet"
                    : "No credit trades match the current filters"}
                </td>
              </tr>
            </Show>
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

/** A trade-id-set snapshot, taken across emissions to detect "just booked"
 * arrivals (see the new-trade flash comment above). */
interface TradeIdSnapshot {
  key: string;
  ids: ReadonlySet<number>;
}
