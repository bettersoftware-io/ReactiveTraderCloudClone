import type { HistoricPosition } from "@rtc/domain";

export const CHART_WIDTH = 400;
export const CHART_HEIGHT = 120;
const PADDING = 8;

export interface PnlChartShape {
  /** SVG path `d` for the P&L line, or "" when there are too few points. */
  path: string;
  /** Y of the zero baseline, or null when 0 is outside the value range. */
  zeroY: number | null;
}

/** Derive the P&L line path and zero baseline in one pass over the history.
 * Verbatim port of the web `PnlChart.buildChart` (same constants + formulae). */
export function buildChart(
  history: readonly HistoricPosition[],
): PnlChartShape {
  if (history.length < 2) return { path: "", zeroY: null };

  const values = history.map((point) => {
    return point.usdPnl;
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

  const zeroY =
    min > 0 || max < 0 ? null : PADDING + h - ((0 - min) / range) * h;

  return { path, zeroY };
}
