import type { ReactElement } from "react";

import { CandleBars } from "./CandleBars";
import type { ChartVm } from "./chartVm";

import styles from "./CandleChart.module.css";

/**
 * The plot area — horizontal grid lines, right-edge price labels, and the
 * candle bars, all absolutely positioned within via chartVm's precomputed
 * CSS custom properties.
 */
export function CandleChart({ vm }: CandleChartProps): ReactElement {
  return (
    <div className={styles.plot}>
      {vm.grid.map((g) => {
        return (
          <div
            key={g.key}
            className={styles.grid}
            style={g.style}
            data-testid="chart-grid-line"
          />
        );
      })}
      {vm.labels.map((l) => {
        return (
          <div
            key={l.key}
            className={styles.label}
            style={l.style}
            data-testid="chart-price-label"
          >
            {l.txt}
          </div>
        );
      })}
      <CandleBars candles={vm.candles} />
    </div>
  );
}

export interface CandleChartProps {
  vm: ChartVm;
}
