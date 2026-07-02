import type { CSSProperties, ReactElement } from "react";

import styles from "#/credit/Blotter/CreditBlotterPanel.module.css";
import type { CreditTrade } from "#/credit/types";

export interface CreditBlotterPanelProps {
  trades: CreditTrade[];
  count: string;
  newCreditId: number | null;
  onExport(): void;
}

// PROTO L585-590 (panCBlot): the Credit Blotter panel body. The outer dock
// Panel (Task 8) supplies the "▤ Credit Blotter" head label and maximize
// glyph, so this component's own control sub-head renders only the trade
// count and the CSV export button — over a sticky 10-column header row and
// one row per booked credit trade.
export function CreditBlotterPanel(
  props: CreditBlotterPanelProps,
): ReactElement {
  const { trades, count, newCreditId, onExport } = props;

  return (
    <div className={styles.body}>
      <div className={styles.controls}>
        <span className={styles.count}>{count}</span>
        <button type="button" className={styles.csvBtn} onClick={onExport}>
          ⤓ CSV
        </button>
      </div>
      <div className={styles.table}>
        <div className={styles.headerRow}>
          <span>ID</span>
          <span>Status</span>
          <span>Date</span>
          <span>Dir</span>
          <span>Counterparty</span>
          <span>CUSIP</span>
          <span>Security</span>
          <span>Qty</span>
          <span>Type</span>
          <span>Price</span>
        </div>
        {trades.map((trade) => {
          return (
            <CreditBlotterRow
              key={trade.id}
              trade={trade}
              isNew={trade.id === newCreditId}
            />
          );
        })}
      </div>
    </div>
  );
}

interface CreditBlotterRowProps {
  trade: CreditTrade;
  isNew: boolean;
}

// PROTO L589 (creditTrades map): the accent color for the entrance flash —
// the trade's own buy/sell direction color, threaded through as a
// `--row-acc` custom property for the shared rowIn/rowFlashA keyframes.
function rowAccent(trade: CreditTrade): string {
  return trade.dir === "Buy" ? "var(--buy)" : "var(--sell)";
}

// Private row subcomponent — one row per booked credit trade. `isNew` (the
// just-booked trade, threaded down from CreditBlotterPanel) drives the
// `data-new` flash and `trade.dir` drives the `data-dir` text color.
function CreditBlotterRow(props: CreditBlotterRowProps): ReactElement {
  const { trade, isNew } = props;
  const accentStyle = { "--row-acc": rowAccent(trade) } as CSSProperties;

  return (
    <div className={styles.row} data-new={String(isNew)} style={accentStyle}>
      <span className={styles.dim}>{trade.id}</span>
      <span className={styles.status}>{trade.status}</span>
      <span className={styles.dim}>{trade.date}</span>
      <span className={styles.dir} data-dir={trade.dir}>
        {trade.dir}
      </span>
      <span>{trade.cp}</span>
      <span className={styles.dim}>{trade.cusip}</span>
      <span>{trade.sec}</span>
      <span>{trade.qty}</span>
      <span className={styles.dim}>{trade.ot}</span>
      <span>{trade.price}</span>
    </div>
  );
}
