import type { ReactElement } from "react";

import styles from "#/equities/Chart/CandleBars.module.css";
import type { ChartVm } from "#/equities/chartVm";

export interface CandleBarsProps {
  candles: ChartVm["candles"];
}

// PROTO L1343: one wick + body div per candle. All geometry rides in via the
// `--x/--top/--h/--w/--w*` custom properties on each element (the sanctioned
// inline-style escape hatch); up/down colour is a `data-up` class hook.
export function CandleBars(props: CandleBarsProps): ReactElement {
  const { candles } = props;

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
