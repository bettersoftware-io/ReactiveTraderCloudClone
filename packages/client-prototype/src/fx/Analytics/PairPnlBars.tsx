import type { CSSProperties, ReactElement } from "react";

import { fmtBarVal, PAIR_PNL } from "#/fx/Analytics/analyticsData";
import styles from "#/fx/Analytics/PairPnlBars.module.css";

// PROTO 511-513: "PnL per Currency Pair" with one horizontal bar per pair —
// pair label, a track whose fill width is the PROTO width %, and the value.
export function PairPnlBars(): ReactElement {
  return (
    <>
      <div className={styles.heading}>PnL per Currency Pair</div>
      {PAIR_PNL.map((row) => {
        const fillStyle = { "--bar-pct": `${row.width}%` } as CSSProperties;
        const sign = row.positive ? "pos" : "neg";
        return (
          <div className={styles.row} key={row.pair}>
            <span className={styles.pair}>{row.pair}</span>
            <span className={styles.track}>
              <span
                className={styles.fill}
                data-sign={sign}
                style={fillStyle}
              />
            </span>
            <span className={styles.val} data-sign={sign}>
              {fmtBarVal(row.val)}
            </span>
          </div>
        );
      })}
    </>
  );
}
