import type { CSSProperties, ReactElement } from "react";

import { latencyBuckets } from "@rtc/client-core";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./LatencyHistogram.module.css";

/**
 * Latency-distribution histogram — 6 fixed buckets (ported from PROTO
 * Latency/LatencyHistogram.tsx), each bar's height driven by a --bar-h custom
 * property computed by the shared latencyBuckets vm (client-core) from the
 * live latency window; the modal (highest-count) bucket is flagged via
 * data-accent.
 */
export function LatencyHistogram(): ReactElement {
  const { useMetrics } = useViewModel();
  const { latency } = useMetrics();
  const bars = latencyBuckets(latency);

  return (
    <div data-testid="admin-latency-histogram" className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>LATENCY DISTRIBUTION</span>
        <span className={styles.sub}>ms</span>
      </div>
      {latency.length === 0 ? (
        <div className={styles.empty}>NO DATA</div>
      ) : (
        <div className={styles.bars}>
          {bars.map((bar) => {
            return (
              <div className={styles.col} key={bar.label}>
                <div
                  className={styles.bar}
                  data-accent={String(bar.accent)}
                  style={
                    // eslint-disable-next-line no-restricted-syntax -- runtime bar height via CSS custom property; static CSS can't express a per-bucket value
                    { "--bar-h": `${bar.heightPct}%` } as CSSProperties
                  }
                />
                <span className={styles.tick}>{bar.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
