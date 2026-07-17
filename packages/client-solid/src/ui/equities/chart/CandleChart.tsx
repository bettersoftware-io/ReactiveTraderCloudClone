import { For, type JSX } from "solid-js";

import type { ChartVm } from "@rtc/motion-core";

import { CandleBars } from "./CandleBars";

import styles from "./CandleChart.module.css";

/**
 * The plot area — horizontal grid lines, right-edge price labels, and the
 * candle bars, all absolutely positioned within via chartVm's precomputed
 * CSS custom properties.
 */
export function CandleChart(props: CandleChartProps): JSX.Element {
  return (
    <div class={styles.plot}>
      <For each={props.vm.grid}>
        {(g: ChartVm["grid"][number]): JSX.Element => {
          return (
            <div
              class={styles.grid}
              style={g.style}
              data-testid="chart-grid-line"
            />
          );
        }}
      </For>
      <For each={props.vm.labels}>
        {(l: ChartVm["labels"][number]): JSX.Element => {
          return (
            <div
              class={styles.label}
              style={l.style}
              data-testid="chart-price-label"
            >
              {l.txt}
            </div>
          );
        }}
      </For>
      <CandleBars candles={props.vm.candles} />
    </div>
  );
}

export interface CandleChartProps {
  vm: ChartVm;
}
