import { useMemo } from "react";

import {
  type CreditTrade,
  type Dealer,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";

import { useHooks } from "../../hooks/useHooks";

import styles from "./CreditBlotter.module.css";

const COLUMNS = [
  "Trade ID",
  "Status",
  "Trade Date",
  "Direction",
  "Counterparty",
  "CUSIP",
  "Security",
  "Quantity",
  "Order Type",
  "Unit Price",
] as const;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

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
        tradeDate: formatDate(rfq.creationTimestamp),
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

  return trades.sort((a, b) => b.tradeId - a.tradeId);
}

export function CreditBlotter() {
  const hooks = useHooks();
  const rfqs = hooks.useRfqs();
  const allQuotes = hooks.useAllQuotes();
  const instruments = hooks.useInstruments();
  const dealers = hooks.useDealers();

  const instrumentMap = useMemo(() => {
    const m = new Map<number, Instrument>();
    for (const i of instruments) m.set(i.id, i);
    return m;
  }, [instruments]);

  const dealerMap = useMemo(() => {
    const m = new Map<number, Dealer>();
    for (const d of dealers) m.set(d.id, d);
    return m;
  }, [dealers]);

  const trades = useMemo(
    () => deriveTrades(rfqs, allQuotes, instrumentMap, dealerMap),
    [rfqs, allQuotes, instrumentMap, dealerMap],
  );

  return (
    <div className={styles.blotter}>
      <span className={styles.title}>Credit Trades</span>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col} className={styles.headerCell}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.tradeId}>
                <td className={styles.cell}>{trade.tradeId}</td>
                <td className={styles.cell}>Accepted</td>
                <td className={styles.cell}>{trade.tradeDate}</td>
                <td className={styles.cell}>{trade.direction}</td>
                <td className={styles.cell}>{trade.counterParty}</td>
                <td className={styles.cell}>{trade.cusip}</td>
                <td className={styles.cell}>{trade.security}</td>
                <td className={styles.cell}>
                  {trade.quantity.toLocaleString()}
                </td>
                <td className={styles.cell}>{trade.orderType}</td>
                <td className={styles.cell}>${trade.unitPrice}</td>
              </tr>
            ))}
            {trades.length === 0 && (
              <tr>
                <td colSpan={10} className={styles.emptyCell}>
                  No credit trades yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
