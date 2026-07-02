import type { CSSProperties, ReactElement } from "react";

import styles from "#/admin/Latency/LatencyHistogram.module.css";
import type { LatBar } from "#/admin/types";

export interface LatencyHistogramProps {
  bars: LatBar[];
}

// PROTO L701-706: latency-distribution histogram — one bar per bucket, height
// via a --bar-h custom property, accent bucket flagged with data-accent.
export function LatencyHistogram(props: LatencyHistogramProps): ReactElement {
  const { bars } = props;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>LATENCY DISTRIBUTION</span>
        <span className={styles.sub}>ms</span>
      </div>
      <div className={styles.bars}>
        {bars.map((bar) => {
          const barStyle = { "--bar-h": `${bar.heightPct}%` } as CSSProperties;
          return (
            <div className={styles.col} key={bar.label}>
              <div
                className={styles.bar}
                data-accent={String(bar.accent)}
                style={barStyle}
              />
              <span className={styles.tick}>{bar.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
