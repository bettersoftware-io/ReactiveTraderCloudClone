import type { ReactElement } from "react";

import { CandleChart } from "#/equities/Chart/CandleChart";
import styles from "#/equities/Chart/ChartPanel.module.css";
import { InstrumentHeader } from "#/equities/Chart/InstrumentHeader";
import { InstrumentTabs } from "#/equities/Chart/InstrumentTabs";
import { TimeframePills } from "#/equities/Chart/TimeframePills";
import { chartVm } from "#/equities/chartVm";
import type { EqSym } from "#/equities/types";
import type { EqChartApi } from "#/equities/useEqChart";
import type { FlashEvent } from "#/equities/useEquities";

const FLASH_MS = 650;

export interface ChartPanelProps {
  chart: EqChartApi;
  rates: Record<EqSym, number>;
  prev: Record<EqSym, number>;
  flash: Record<EqSym, FlashEvent>;
  vol: Record<EqSym, string>;
  now: number;
}

// PROTO L599-624: the chart panel body — a control sub-head (instrument tabs +
// timeframe pills; the outer dock Panel from Task 9 owns the maximize glyph),
// then the live instrument header over the candlestick plot.
export function ChartPanel(props: ChartPanelProps): ReactElement {
  const { chart, rates, prev, flash, vol, now } = props;
  const sel = chart.sel;
  const last = rates[sel];
  const fl = flash[sel];
  const flashOn = fl != null && now - fl.ts < FLASH_MS;
  const seriesHigh = Math.max(
    ...chart.series.map((c) => {
      return c.h;
    }),
  );
  const seriesLow = Math.min(
    ...chart.series.map((c) => {
      return c.l;
    }),
  );
  const vm = chartVm(chart.series, last, flashOn);

  return (
    <div className={styles.body}>
      <div className={styles.controls}>
        <InstrumentTabs
          tabs={chart.openTabs}
          sel={sel}
          onSelect={chart.selectEq}
          onClose={chart.closeTab}
        />
        <div className={styles.spacer} />
        <TimeframePills tf={chart.tf} onSet={chart.setTf} />
      </div>
      <div className={styles.chartArea}>
        <InstrumentHeader
          sym={sel}
          last={last}
          prev={prev[sel]}
          flashOn={flashOn}
          flashDir={fl?.dir ?? 1}
          seriesHigh={seriesHigh}
          seriesLow={seriesLow}
          vol={vol[sel]}
        />
        <CandleChart vm={vm} />
      </div>
    </div>
  );
}
