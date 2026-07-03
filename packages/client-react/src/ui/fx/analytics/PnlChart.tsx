import type { ReactElement } from "react";
import { useId } from "react";

import type { HistoricPosition } from "@rtc/domain";

import styles from "./PnlChart.module.css";

export function PnlChart({ history }: PnlChartProps): ReactElement {
  const { areaPath, path, zeroY } = buildChart(history);
  const lastValue = history.length > 0 ? history[history.length - 1].usdPnl : 0;
  const isPositive = lastValue >= 0;
  const gradientId = useId();

  return (
    <svg
      width="100%"
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      className={styles.chart}
    >
      <title>P&amp;L chart</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.32} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      {zeroY !== null && (
        <line
          x1={PADDING}
          x2={CHART_WIDTH - PADDING}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border-primary)"
          strokeWidth={0.5}
          strokeDasharray="4 2"
        />
      )}
      {areaPath !== "" && (
        <path
          d={areaPath}
          fill={`url(#${gradientId})`}
          data-sign={isPositive ? "positive" : "negative"}
          className={styles.area}
        />
      )}
      {path !== "" && (
        <path
          d={path}
          fill="none"
          data-sign={isPositive ? "positive" : "negative"}
          stroke={
            isPositive ? "var(--accent-positive)" : "var(--accent-negative)"
          }
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className={styles.line}
        />
      )}
    </svg>
  );
}

interface PnlChartProps {
  history: readonly HistoricPosition[];
}

const CHART_WIDTH = 400;
const CHART_HEIGHT = 120;
const PADDING = 8;

interface PnlChartShape {
  /** SVG path `d` for the P&L line, or "" when there are too few points. */
  path: string;
  /** `path` closed to the bottom edge, for the gradient area fill; "" when `path` is. */
  areaPath: string;
  /** Y of the zero baseline, or null when 0 is outside the value range. */
  zeroY: number | null;
}

// Derive both the line path and the zero baseline from a single pass over the
// history: values, min/max and the plot height are shared, so compute them once.
function buildChart(history: readonly HistoricPosition[]): PnlChartShape {
  if (history.length < 2) return { path: "", areaPath: "", zeroY: null };

  const values = history.map((h) => {
    return h.usdPnl;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = CHART_WIDTH - PADDING * 2;
  const h = CHART_HEIGHT - PADDING * 2;
  const step = w / (values.length - 1);

  const path = values
    .map((v, i) => {
      const x = PADDING + i * step;
      const y = PADDING + h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPath =
    path === ""
      ? ""
      : `${path} L${CHART_WIDTH - PADDING},${CHART_HEIGHT} L${PADDING},${CHART_HEIGHT} Z`;

  // Zero baseline only when 0 falls within [min, max].
  const zeroY =
    min > 0 || max < 0 ? null : PADDING + h - ((0 - min) / range) * h;

  return { path, areaPath, zeroY };
}
