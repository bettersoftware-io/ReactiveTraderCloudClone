import type { CSSProperties, ReactElement } from "react";

import type { CurrencyPairPosition } from "@rtc/domain";

import styles from "./PairPnlBars.module.css";

interface PairPnlBarsProps {
  positions: readonly CurrencyPairPosition[];
}

function formatPnl(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return value.toFixed(0);
}

export function PairPnlBars({ positions }: PairPnlBarsProps): ReactElement {
  const maxAbsPnl = Math.max(
    ...positions.map((p) => {
      return Math.abs(p.basePnl);
    }),
    1,
  );

  return (
    <div className={styles.container}>
      {positions.map((pos) => {
        const fraction = pos.basePnl / maxAbsPnl;
        const sign = pos.basePnl >= 0 ? "pos" : "neg";
        const barWidth = `${Math.abs(fraction) * 50}%`;

        return (
          <div key={pos.symbol} className={styles.row}>
            <span className={styles.symbol}>{pos.symbol}</span>
            <div className={styles.barContainer}>
              {/* Center line */}
              <div className={styles.centerLine} />
              {/* Bar: continuous width via custom property; side via data-sign */}
              <div
                data-sign={sign}
                className={styles.bar}
                style={{ "--bar-width": barWidth } as CSSProperties}
              />
            </div>
            <span data-sign={sign} className={styles.pnlLabel}>
              {formatPnl(pos.basePnl)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
