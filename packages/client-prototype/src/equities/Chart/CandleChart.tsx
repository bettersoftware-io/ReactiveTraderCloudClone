import type { ReactElement } from "react";

import { CandleBars } from "#/equities/Chart/CandleBars";
import styles from "#/equities/Chart/CandleChart.module.css";
import type { ChartVm } from "#/equities/chartVm";

export interface CandleChartProps {
  vm: ChartVm;
}

// PROTO L619-623: the plot area — horizontal grid lines, right-edge price
// labels, and the candle bars, all absolutely positioned within.
export function CandleChart(props: CandleChartProps): ReactElement {
  const { vm } = props;

  return (
    <div className={styles.plot}>
      {vm.grid.map((g) => {
        return <div key={g.key} className={styles.grid} style={g.style} />;
      })}
      {vm.labels.map((l) => {
        return (
          <div key={l.key} className={styles.label} style={l.style}>
            {l.txt}
          </div>
        );
      })}
      <CandleBars candles={vm.candles} />
    </div>
  );
}
