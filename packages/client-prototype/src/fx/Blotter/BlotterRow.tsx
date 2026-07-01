import type { CSSProperties, ReactElement } from "react";

import styles from "#/fx/Blotter/BlotterRow.module.css";
import type { Trade } from "#/fx/types";

export interface BlotterRowProps {
  trade: Trade;
  isNew: boolean;
}

// PROTO 1309 (fxTrades map): the accent color for the entrance flash —
// Rejected trades always flash sell-red; otherwise the trade's own
// buy/sell direction color.
function rowAccent(trade: Trade): string {
  if (trade.status === "Rejected") {
    return "var(--sell)";
  }

  return trade.dir === "Buy" ? "var(--buy)" : "var(--sell)";
}

export function BlotterRow(props: BlotterRowProps): ReactElement {
  const { trade, isNew } = props;
  const accentStyle = { "--row-acc": rowAccent(trade) } as CSSProperties;
  // PROTO 1309: alternate rowFlashA/B by id parity so consecutive new rows
  // don't all pulse in lockstep.
  const flashClass = trade.id % 2 ? styles.flashB : styles.flashA;
  const rowClass = isNew ? `${styles.row} ${flashClass}` : styles.row;

  return (
    <div
      className={rowClass}
      data-new={isNew ? "" : undefined}
      style={accentStyle}
    >
      <span className={styles.dim}>{trade.id}</span>
      <span className={trade.status === "Rejected" ? styles.sell : styles.buy}>
        {trade.status}
      </span>
      <span className={styles.dim}>{trade.tradeDate}</span>
      <span className={trade.dir === "Buy" ? styles.buy : styles.sell}>
        {trade.dir}
      </span>
      <span>{trade.symbol}</span>
      <span className={styles.dim}>{trade.dealtCcy}</span>
      <span>{trade.notional}</span>
      <span>{trade.rate}</span>
      <span className={styles.dim}>{trade.valueDate}</span>
      <span className={styles.dim}>{trade.trader}</span>
    </div>
  );
}
