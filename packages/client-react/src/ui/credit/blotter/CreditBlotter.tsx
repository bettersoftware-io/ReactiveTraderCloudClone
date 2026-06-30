import type { ReactElement } from "react";
import { useState } from "react";

import {
  type CreditTrade,
  type Dealer,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";

import { BlotterHeader } from "#/ui/fx/blotter/BlotterHeader";
import { BlotterRow } from "#/ui/fx/blotter/BlotterRow";
import type { ColumnFilter } from "#/ui/fx/blotter/columnFilter/filterState";
import { applyFilters } from "#/ui/fx/blotter/columnFilter/filterState";
import {
  applySort,
  nextSortDirection,
  type SortState,
} from "#/ui/fx/blotter/columnSort";
import { exportToCsv } from "#/ui/fx/blotter/csvExport";
import { QuickFilter } from "#/ui/fx/blotter/QuickFilter";
import { useViewModel } from "#/ui/hooks/useViewModel";

import {
  CREDIT_COLUMNS,
  CREDIT_CSV_UNFORMATTED,
  CREDIT_DESC_FIRST,
  formatCreditCell,
} from "./creditBlotterColumns";

import styles from "./CreditBlotter.module.css";

function deriveTrades(
  rfqs: readonly Rfq[],
  allQuotes: ReadonlyMap<number, Quote>,
  instruments: Map<number, Instrument>,
  dealers: Map<number, Dealer>,
): CreditTrade[] {
  const trades: CreditTrade[] = [];

  for (const rfq of rfqs) {
    if (rfq.state !== RfqState.Closed) continue;

    // Find the accepted quote
    for (const quote of allQuotes.values()) {
      if (quote.rfqId !== rfq.id || quote.state.type !== "accepted") continue;

      const instrument = instruments.get(rfq.instrumentId);
      const dealer = dealers.get(quote.dealerId);

      trades.push({
        tradeId: rfq.id,
        status: "accepted",
        tradeDate: new Date(rfq.creationTimestamp).toISOString().slice(0, 10),
        direction: rfq.direction,
        counterParty: dealer?.name ?? `Dealer ${quote.dealerId}`,
        cusip: instrument?.cusip ?? "",
        security: instrument?.ticker ?? "",
        quantity: rfq.quantity,
        orderType: "AON",
        unitPrice: quote.state.price,
      });
      break;
    }
  }

  return trades.sort((a, b) => {
    return b.tradeId - a.tradeId;
  });
}

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
  const [quickFilter, setQuickFilter] = useState("");

  const instrumentMap = new Map<number, Instrument>();

  for (const i of instruments) {
    instrumentMap.set(i.id, i);
  }

  const dealerMap = new Map<number, Dealer>();

  for (const d of dealers) {
    dealerMap.set(d.id, d);
  }

  const trades = deriveTrades(rfqs, allQuotes, instrumentMap, dealerMap);

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

  const activeFilterLabels: string[] = [];

  for (const key of filters.keys()) {
    const col = CREDIT_COLUMNS.find((c) => {
      return c.key === key;
    });
    if (col) activeFilterLabels.push(col.label);
  }

  return (
    <div className={styles.blotter}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.title}>Credit Trades</span>
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
            return exportToCsv(
              processedTrades,
              CREDIT_COLUMNS,
              formatCreditCell,
              CREDIT_CSV_UNFORMATTED,
            );
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
              columns={CREDIT_COLUMNS}
            />
          </thead>
          <tbody>
            {processedTrades.map((trade) => {
              return (
                <BlotterRow
                  key={trade.tradeId}
                  trade={trade}
                  isNew={false}
                  columns={CREDIT_COLUMNS}
                  format={formatCreditCell}
                />
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
