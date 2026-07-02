import { type ReactElement, useId } from "react";

import styles from "#/admin/Throughput/ThroughputChart.module.css";

export interface ThroughputChartProps {
  line: string;
  area: string;
}

// PROTO L697-700: message-throughput area+line chart. The area is filled with a
// vertical accent2 gradient; the line glows. Paths come from throughputVm.
export function ThroughputChart(props: ThroughputChartProps): ReactElement {
  const { line, area } = props;
  const gradientId = useId();

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.title}>MESSAGE THROUGHPUT</span>
        <span className={styles.sub}>last 60s · msg/s</span>
      </div>
      <svg
        className={styles.svg}
        viewBox="0 0 300 96"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent2)" stopOpacity="0.3" />
            <stop offset="1" stopColor="var(--accent2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <polyline className={styles.line} points={line} />
      </svg>
    </div>
  );
}
