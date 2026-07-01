import { type ReactElement, useId } from "react";

import { PNL_AREA, PNL_LINE } from "#/fx/Analytics/analyticsData";
import styles from "#/fx/Analytics/PnlSummary.module.css";

// PROTO 509: static area+line PnL chart. The area is filled with a vertical
// accent2 gradient; the line is the buy color with a soft glow.
export function PnlSparkline(): ReactElement {
  const gradientId = useId();

  return (
    <svg
      className={styles.spark}
      viewBox="0 0 300 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent2)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--accent2)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={PNL_AREA} fill={`url(#${gradientId})`} />
      <polyline
        className={styles.sparkLine}
        points={PNL_LINE}
        fill="none"
        stroke="var(--buy)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
