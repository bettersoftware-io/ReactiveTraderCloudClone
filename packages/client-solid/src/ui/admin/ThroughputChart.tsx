import type { JSX } from "solid-js";
import { createMemo, createUniqueId, Show } from "solid-js";

import { type ThroughputPaths, throughputPaths } from "@rtc/client-core";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./ThroughputChart.module.css";

/**
 * Message-throughput area+line chart — an SVG gradient-glow area chart
 * replacing the earlier <canvas> draw, ported from PROTO
 * Throughput/ThroughputChart.tsx. Both the glow line and the gradient area
 * come from the shared throughputPaths vm (client-core) as smoothed
 * Catmull-Rom path `d` strings; the gradient id is per-instance via
 * createUniqueId() (PnlChart.tsx precedent), and the area fill closes to a
 * flat baseline when no data has arrived yet, which is when the "NO DATA"
 * placeholder takes over instead.
 */
export function ThroughputChart(): JSX.Element {
  const { useMetrics } = useViewModel();
  const { throughput } = useMetrics();

  const paths = createMemo((): ThroughputPaths => {
    return throughputPaths(throughput());
  });
  const gradientId = createUniqueId();

  return (
    <div data-testid="admin-throughput-chart" class={styles.card}>
      <div class={styles.head}>
        <span class={styles.title}>MESSAGE THROUGHPUT</span>
        <span class={styles.sub}>last 60s · msg/s</span>
      </div>
      <Show
        when={throughput().length > 0}
        fallback={<div class={styles.empty}>NO DATA</div>}
      >
        <svg
          class={styles.svg}
          viewBox="0 0 300 96"
          preserveAspectRatio="none"
          aria-label="Throughput chart"
        >
          <title>Throughput chart</title>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0"
                stop-color="var(--accent-2)"
                stop-opacity="0.3"
              />
              <stop offset="1" stop-color="var(--accent-2)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d={paths().area} fill={`url(#${gradientId})`} />
          <path class={styles.line} d={paths().line} />
        </svg>
      </Show>
    </div>
  );
}
