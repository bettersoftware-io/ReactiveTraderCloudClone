import type { HistoricPosition } from "@rtc/domain";

export const CHART_WIDTH = 400;
export const CHART_HEIGHT = 120;
const PADDING = 8;

export interface PnlChartShape {
  /** SVG path `d` for the P&L line, or "" when there are too few points. */
  path: string;
  /** `path` closed down to the chart floor, for the area fill. "" when empty. */
  areaPath: string;
  /** Y of the zero baseline, or null when 0 is outside the value range. */
  zeroY: number | null;
}

interface ChartPoint {
  x: number;
  y: number;
}

/** Derive the P&L line path and zero baseline in one pass over the history.
 * Verbatim port of the web `PnlChart.buildChart` (same constants + formulae). */
export function buildChart(
  history: readonly HistoricPosition[],
): PnlChartShape {
  if (history.length < 2) {
    return { path: "", areaPath: "", zeroY: null };
  }

  const values = history.map((point) => {
    return point.usdPnl;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = CHART_WIDTH - PADDING * 2;
  const h = CHART_HEIGHT - PADDING * 2;
  const step = w / (values.length - 1);

  const points: ChartPoint[] = values.map((v, i) => {
    return {
      x: PADDING + i * step,
      y: PADDING + h - ((v - min) / range) * h,
    };
  });

  const path = smoothPath(points);

  // Closes to the chart FLOOR, not to the zero baseline. At 90 history points
  // a floor-closed area is the shape the web draws and the prototype shows;
  // closing to zero would split the fill above and below the baseline, which is
  // a different chart.
  const areaPath = `${path} L${CHART_WIDTH - PADDING},${CHART_HEIGHT} L${PADDING},${CHART_HEIGHT} Z`;

  // Zero baseline only when 0 falls within [min, max] — the web does the same.
  // The Phase 5 design says zero is "always forced into the Y domain"; it is
  // not, on either client, and forcing it would rescale every all-positive
  // chart and move a figure the prototype pins.
  const zeroY =
    min > 0 || max < 0 ? null : PADDING + h - ((0 - min) / range) * h;

  return { path, areaPath, zeroY };
}

/**
 * Catmull-Rom-through-cubic-Bézier smoothing (standard 1/6-tension formula),
 * ported verbatim from the web `PnlChart.smoothPath`.
 *
 * Each segment's control points come from the neighbours either side, so the
 * curve passes through every data point while staying tangent-continuous. RN
 * previously drew straight `L` segments, which at 90 history points reads as a
 * jagged line and a boxy area fill rather than the prototype's smooth glow.
 *
 * Only called from `buildChart`, which already guards `history.length >= 2`.
 */
function smoothPath(points: readonly ChartPoint[]): string {
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
