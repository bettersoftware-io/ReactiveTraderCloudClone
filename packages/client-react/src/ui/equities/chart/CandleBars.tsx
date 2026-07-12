import type { ReactElement } from "react";

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
export function CandleBars({ candles }: CandleBarsProps): ReactElement {
  return (
    <>
      {candles.map((cd) => {
        return (
          <div key={cd.key} data-candle="" data-up={String(cd.up)}>
            <span
              className={styles.wick}
              style={cd.wickStyle}
              data-up={String(cd.up)}
            />
            <span
              className={styles.body}
              style={cd.style}
              data-up={String(cd.up)}
              data-last={String(cd.last)}
              data-glow={String(cd.glow)}
            />
          </div>
        );
      })}
    </>
  );
}

export interface CandleBarsProps {
  candles: ChartVm["candles"];
}
