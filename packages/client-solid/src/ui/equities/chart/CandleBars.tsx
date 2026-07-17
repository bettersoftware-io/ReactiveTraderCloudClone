import { For, type JSX } from "solid-js";

import type { ChartVm } from "@rtc/motion-core";

import styles from "./CandleBars.module.css";

/**
 * One wick + body span per candle. All geometry rides in via the
 * `--x/--top/--h/--w/--w*` custom properties precomputed by chartVm — each
 * `style={...}` here references that precomputed value (not an inline object
 * literal), so it needs no lint escape hatch. Up/down colour is a `data-up`
 * hook; the last candle also carries `data-last` (full opacity) and
 * `data-glow` (a brief box-shadow while the price is actively ticking).
 */
export function CandleBars(props: CandleBarsProps): JSX.Element {
  return (
    <For each={props.candles}>
      {(cd: ChartVm["candles"][number]): JSX.Element => {
        return (
          <div data-candle="" data-up={String(cd.up)}>
            <span
              class={styles.wick}
              style={cd.wickStyle}
              data-up={String(cd.up)}
            />
            <span
              class={styles.body}
              style={cd.style}
              data-up={String(cd.up)}
              data-last={String(cd.last)}
              data-glow={String(cd.glow)}
            />
          </div>
        );
      }}
    </For>
  );
}

export interface CandleBarsProps {
  candles: ChartVm["candles"];
}
