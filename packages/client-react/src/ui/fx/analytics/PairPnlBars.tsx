import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import { type CurrencyPairPosition, formatPrecise2, formatWithScale } from "@rtc/domain";

import styles from "./PairPnlBars.module.css";

interface PairPnlBarsProps {
  positions: readonly CurrencyPairPosition[];
}

export function PairPnlBars({ positions }: PairPnlBarsProps): ReactElement {
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);

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
        const hovering = hoveredSymbol === pos.symbol;
        const label = hovering
          ? formatPrecise2(pos.basePnl)
          : formatWithScale(pos.basePnl);

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
            <span
              data-sign={sign}
              data-testid={`priceLabel-${pos.symbol}`}
              className={styles.pnlLabel}
              onMouseEnter={() => {
                return setHoveredSymbol(pos.symbol);
              }}
              onMouseLeave={() => {
                return setHoveredSymbol(null);
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
