import type { HistoricPosition } from "@rtc/domain";

import styles from "./PnlChart.module.css";

interface PnlChartProps {
  history: readonly HistoricPosition[];
}

const CHART_WIDTH = 400;
const CHART_HEIGHT = 120;
const PADDING = 8;

function buildPath(history: readonly HistoricPosition[]): string {
  if (history.length < 2) return "";

  const values = history.map((h) => h.usdPnl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = CHART_WIDTH - PADDING * 2;
  const h = CHART_HEIGHT - PADDING * 2;
  const step = w / (values.length - 1);

  return values
    .map((v, i) => {
      const x = PADDING + i * step;
      const y = PADDING + h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildZeroLine(history: readonly HistoricPosition[]): number | null {
  if (history.length < 2) return null;
  const values = history.map((h) => h.usdPnl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const h = CHART_HEIGHT - PADDING * 2;

  if (min > 0 || max < 0) return null;
  return PADDING + h - ((0 - min) / range) * h;
}

export function PnlChart({ history }: PnlChartProps) {
  const path = buildPath(history);
  const zeroY = buildZeroLine(history);
  const lastValue = history.length > 0 ? history[history.length - 1].usdPnl : 0;
  const isPositive = lastValue >= 0;

  return (
    <svg
      width="100%"
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      className={styles.chart}
    >
      <title>P&amp;L chart</title>
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
      {path && (
        <path
          d={path}
          fill="none"
          stroke={
            isPositive ? "var(--accent-positive)" : "var(--accent-negative)"
          }
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
