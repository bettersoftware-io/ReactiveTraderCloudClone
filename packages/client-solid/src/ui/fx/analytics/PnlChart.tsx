import type { JSX } from "solid-js";
import { createMemo, createUniqueId, Show } from "solid-js";

import type { HistoricPosition } from "@rtc/domain";

import styles from "./PnlChart.module.css";

export function PnlChart(props: PnlChartProps): JSX.Element {
  const chart = createMemo((): PnlChartShape => {
    return buildChart(props.history);
  });

  const isPositive = createMemo((): boolean => {
    const lastValue =
      props.history.length > 0
        ? props.history[props.history.length - 1].usdPnl
        : 0;
    return lastValue >= 0;
  });
  const gradientId = createUniqueId();

  return (
    <svg
      width="100%"
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      class={styles.chart}
    >
      <title>P&amp;L chart</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity={0.32} />
          <stop offset="100%" stop-color="currentColor" stop-opacity={0} />
        </linearGradient>
      </defs>
      <Show when={chart().zeroY !== null}>
        <line
          x1={PADDING}
          x2={CHART_WIDTH - PADDING}
          y1={chart().zeroY ?? 0}
          y2={chart().zeroY ?? 0}
          stroke="var(--border-primary)"
          stroke-width={0.5}
          stroke-dasharray="4 2"
        />
      </Show>
      <Show when={chart().areaPath !== ""}>
        <path
          d={chart().areaPath}
          fill={`url(#${gradientId})`}
          data-sign={isPositive() ? "positive" : "negative"}
          class={styles.area}
        />
      </Show>
      <Show when={chart().path !== ""}>
        <path
          d={chart().path}
          fill="none"
          data-sign={isPositive() ? "positive" : "negative"}
          stroke={
            isPositive() ? "var(--accent-positive)" : "var(--accent-negative)"
          }
          stroke-width={2}
          stroke-linejoin="round"
          stroke-linecap="round"
          class={styles.line}
        />
      </Show>
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

interface Point {
  x: number;
  y: number;
}

// Derive both the line path and the zero baseline from a single pass over the
// history: values, min/max and the plot height are shared, so compute them once.
function buildChart(history: readonly HistoricPosition[]): PnlChartShape {
  if (history.length < 2) {
    return { path: "", areaPath: "", zeroY: null };
  }

  const values = history.map((h) => {
    return h.usdPnl;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = CHART_WIDTH - PADDING * 2;
  const h = CHART_HEIGHT - PADDING * 2;
  const step = w / (values.length - 1);

  const points: Point[] = values.map((v, i) => {
    return {
      x: PADDING + i * step,
      y: PADDING + h - ((v - min) / range) * h,
    };
  });

  const path = smoothPath(points);

  const areaPath = `${path} L${CHART_WIDTH - PADDING},${CHART_HEIGHT} L${PADDING},${CHART_HEIGHT} Z`;

  // Zero baseline only when 0 falls within [min, max].
  const zeroY =
    min > 0 || max < 0 ? null : PADDING + h - ((0 - min) / range) * h;

  return { path, areaPath, zeroY };
}

// Catmull-Rom-through-cubic-Bézier smoothing (standard 1/6-tension formula):
// each segment's control points are derived from the neighbours either side
// of the segment's endpoints, so the curve passes through every data point
// while staying tangent-continuous — replaces the old straight-`L`-segment
// polyline (which read as a jagged line + a boxy area fill at 90 history
// points) with the smooth glow-area look of the v2 prototype.
// Only called from buildChart, which already guards `history.length >= 2`.
function smoothPath(points: readonly Point[]): string {
  const first = points[0];
  let d = `M${fmt(first.x)},${fmt(first.y)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }

  return d;
}

function fmt(n: number): string {
  return n.toFixed(1);
}
