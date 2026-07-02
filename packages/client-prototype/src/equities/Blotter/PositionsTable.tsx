import type { CSSProperties, ReactElement } from "react";

import styles from "#/equities/Blotter/PositionsTable.module.css";
import type { EqPosition } from "#/equities/types";

export interface PositionsTableProps {
  positions: EqPosition[];
}

const HEADERS = ["Symbol", "Qty", "Avg Px", "Last", "Mkt Value", "P/L"];

// PROTO L633-636: the positions grid — a sticky 6-column header over one row
// per open position.
export function PositionsTable(props: PositionsTableProps): ReactElement {
  const { positions } = props;

  if (positions.length === 0) {
    return <div className={styles.empty}>No open positions</div>;
  }

  return (
    <div className={styles.table}>
      <div className={styles.headerRow}>
        {HEADERS.map((h) => {
          return <span key={h}>{h}</span>;
        })}
      </div>
      {positions.map((p) => {
        const plStyle = { "--pl": p.plColor } as CSSProperties;

        return (
          <div key={p.sym} className={styles.row}>
            <span className={styles.sym}>{p.sym}</span>
            <span>{p.qty}</span>
            <span className={styles.dim}>{p.avg}</span>
            <span>{p.last}</span>
            <span>{p.mv}</span>
            <span className={styles.pl} style={plStyle}>
              {p.pl}
            </span>
          </div>
        );
      })}
    </div>
  );
}
