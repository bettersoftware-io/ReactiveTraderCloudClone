import { type ReactElement, useId } from "react";

import { throughputPaths } from "@rtc/client-core";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./ThroughputChart.module.css";

/**
 * Message-throughput area+line chart — an SVG gradient-glow area chart
 * replacing the earlier <canvas> draw, ported from PROTO
 * Throughput/ThroughputChart.tsx. Paths come from the shared throughputPaths
 * vm (client-core); the gradient id is per-instance via useId() (PnlChart.tsx
 * precedent), and the area fill closes to a flat baseline when no data has
 * arrived yet, which is when the "NO DATA" placeholder takes over instead.
 */
export function ThroughputChart(): ReactElement {
  const { useMetrics } = useViewModel();
  const { throughput } = useMetrics();
  const { line, area } = throughputPaths(throughput);
  const gradientId = useId();

  return (
    <div data-testid="admin-throughput-chart" className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>MESSAGE THROUGHPUT</span>
        <span className={styles.sub}>last 120s · msg/s</span>
      </div>
      {throughput.length === 0 ? (
        <div className={styles.empty}>NO DATA</div>
      ) : (
        <svg
          className={styles.svg}
          viewBox="0 0 300 96"
          preserveAspectRatio="none"
          aria-label="Throughput chart"
        >
          <title>Throughput chart</title>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent-2)" stopOpacity="0.3" />
              <stop offset="1" stopColor="var(--accent-2)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <polyline className={styles.line} points={line} />
        </svg>
      )}
    </div>
  );
}
