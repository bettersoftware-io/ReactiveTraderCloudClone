import type { JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import {
  applyFilters,
  applySortToTrades,
  type ColumnFilter,
  nextSortDirection,
  type SortState,
} from "@rtc/client-core";
import type { Trade } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { useFxView } from "#/ui/fx/useFxView";

import { ActivityView } from "./ActivityView";
import { BlotterColgroup } from "./BlotterColgroup";
import { BlotterHeader } from "./BlotterHeader";
import { BlotterRow } from "./BlotterRow";
import { COLUMNS, formatFxCell } from "./blotterColumns";
import { exportFxToCsv } from "./csvExport";

import styles from "./FxBlotter.module.css";

export function FxBlotter(): JSX.Element {
  const { useTrades, useNewTradeIds, useActivity } = useViewModel();
  const trades = useTrades();
  // "Newly arrived" detection is a cross-emission stream-diff; it lives in the
  // presenter (BlotterPresenter.newTradeIds$), not here — see docs/adr/ADR-003.
  const newTradeIds = useNewTradeIds();
  // Same story for the Activity feed's live/seed split and receipt-time
  // stamping — BlotterPresenter.activity$, not here.
  const activity = useActivity();
  const { blotterTab, quickFilter, setExportCsvHandler } = useFxView();
  const [sort, setSort] = createSignal<SortState<Trade>>({
    column: null,
    direction: null,
  });

  const [filters, setFilters] = createSignal<
    Map<keyof Trade, ColumnFilter<Trade>>
  >(new Map());

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

  const filtered = createMemo((): readonly Trade[] => {
    return applyFilters(trades(), filters(), quickFilter());
  });

  const processedTrades = createMemo((): readonly Trade[] => {
    return applySortToTrades(filtered(), sort());
  });

  // The CSV chip lives in FxBlotterHead; it calls exportCsv() from context,
  // which invokes whatever handler was last registered here — bound to the
  // current filtered/sorted rows.
  createEffect(() => {
    const rows = processedTrades();
    setExportCsvHandler(() => {
      exportFxToCsv(rows);
    });
  });

  const activeFilterLabels = createMemo((): string[] => {
    const labels: string[] = [];

    for (const key of filters().keys()) {
      const col = COLUMNS.find((c) => {
        return c.key === key;
      });

      if (col) {
        labels.push(col.label);
      }
    }

    return labels;
  });

  return (
    <Show
      when={blotterTab() === "activity"}
      fallback={
        // Split-header structure (shared with CreditBlotter): the
        // column-header table is a fixed region ABOVE the scrolling rows
        // region, so the header stays put while rows scroll AND
        // BlotterHeader's filter popover anchors outside any scroll clip
        // (position:sticky on thead/th breaks the popover's hit-testing in
        // real Chromium — see CreditBlotter.module.css). The shared
        // BlotterColgroup + table-layout:fixed keep the two tables' column
        // edges aligned exactly.
        <div data-testid="blotter-table" class={styles.blotter}>
          <Show when={activeFilterLabels().length > 0}>
            <span class={styles.filterLabel}>
              Filtered: {activeFilterLabels().join(", ")}
            </span>
          </Show>

          <div class={styles.headerRegion}>
            <table class={styles.table}>
              <BlotterColgroup columns={COLUMNS} />
              <thead>
                <BlotterHeader
                  sort={sort()}
                  onSort={handleSort}
                  filters={filters()}
                  onFilter={handleFilter}
                  rows={trades()}
                  columns={COLUMNS}
                />
              </thead>
            </table>
          </div>

          <div class={styles.tableWrapper}>
            <table class={styles.table}>
              <BlotterColgroup columns={COLUMNS} />
              <tbody>
                <For each={processedTrades()}>
                  {(trade: Trade) => {
                    return (
                      <BlotterRow
                        trade={trade}
                        isNew={newTradeIds().has(trade.tradeId)}
                        columns={COLUMNS}
                        format={formatFxCell}
                      />
                    );
                  }}
                </For>
                <Show when={processedTrades().length === 0}>
                  <tr>
                    <td colSpan={COLUMNS.length} class={styles.emptyCell}>
                      {trades().length === 0
                        ? "No trades yet"
                        : "No trades match the current filters"}
                    </td>
                  </tr>
                </Show>
              </tbody>
            </table>
          </div>
        </div>
      }
    >
      <div class={styles.blotter}>
        <ActivityView entries={activity()} />
      </div>
    </Show>
  );
}
