import type { CSSProperties } from "react";
import type { CurrencyPairPosition } from "@rtc/domain";
import styles from "./PositionBubbles.module.css";

interface PositionBubblesProps {
  positions: readonly CurrencyPairPosition[];
}

const MIN_RADIUS = 15;
const MAX_RADIUS = 60;

function computeRadius(
  basePnl: number,
  maxAbsPnl: number,
): number {
  if (maxAbsPnl === 0) return MIN_RADIUS;
  const fraction = Math.abs(basePnl) / maxAbsPnl;
  return MIN_RADIUS + fraction * (MAX_RADIUS - MIN_RADIUS);
}

export function PositionBubbles({ positions }: PositionBubblesProps) {
  const maxAbsPnl = Math.max(
    ...positions.map((p) => Math.abs(p.basePnl)),
    1,
  );

  return (
    <div className={styles.container}>
      {positions.map((pos) => {
        const radius = computeRadius(pos.basePnl, maxAbsPnl);
        const sign = pos.basePnl >= 0 ? "pos" : "neg";
        const symbol = pos.symbol.slice(0, 3);

        return (
          <div
            key={pos.symbol}
            data-sign={sign}
            className={styles.bubble}
            style={{ "--bubble-size": `${radius * 2}px`, "--bubble-font-size": `${Math.max(9, radius / 3)}px` } as CSSProperties}
          >
            {symbol}
          </div>
        );
      })}
    </div>
  );
}
