import type { ChartViewport } from "./chartViewport.js";
import type { ChartPoint, ChartVarStyle } from "./chartVm.js";

/** The candle fields navigatorVm reads — a structural subset of
 * @rtc/domain's `Candle` (motion-core is zero-dependency); only the close
 * matters for the overview line. */
export interface NavigatorCandle {
  readonly close: number;
}

export interface NavigatorVm {
  /** Full-series close polyline on the 0–100 grid: x spreads indices across
   * the whole strip (`i / (len − 1) × 100`), y maps [min, max] close into
   * the padded band, inverted (high at the top). */
  readonly linePoints: readonly ChartPoint[];
  /** The viewport window as strip CSS vars: `--nav-left` / `--nav-w`,
   * percentages of the series length in candle-slot space (`start / len`,
   * `(end − start) / len`) — slot boundaries, not candle centres, so the
   * shade covers exactly the candles the plot shows. */
  readonly windowStyle: ChartVarStyle;
}

/** Strip-local y padding (the plot's Y_TOP/Y_SPAN belong to its own box). */
const NAV_Y_TOP = 10;
const NAV_Y_SPAN = 80;

export function navigatorVm(
  series: readonly NavigatorCandle[],
  viewport: ChartViewport,
): NavigatorVm {
  const len = series.length;

  if (len === 0) {
    return {
      linePoints: [],
      windowStyle: { "--nav-left": "0%", "--nav-w": "100%" } as ChartVarStyle,
    };
  }

  const closes = series.map((c) => {
    return c.close;
  });
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const rng = max - min || 1;

  // A flat series (every close identical — includes the single-candle
  // case) has no meaningful vertical position: pin y to the band midpoint
  // rather than letting (max − close)/rng collapse everything to the top.
  const flat = max === min;

  const linePoints: ChartPoint[] = closes.map((close, i) => {
    return {
      x: len === 1 ? 50 : (i / (len - 1)) * 100,
      y: flat
        ? NAV_Y_TOP + NAV_Y_SPAN / 2
        : ((max - close) / rng) * NAV_Y_SPAN + NAV_Y_TOP,
    };
  });

  // No clamp here: every viewport reaching this vm already satisfies
  // 0 <= start <= end <= len (clampViewport et al. enforce it upstream), so
  // start/len and end/len already land in [0, 1] without re-guarding.
  const leftPct = (viewport.start / len) * 100;
  const rightPct = (viewport.end / len) * 100;
  const windowStyle = {
    "--nav-left": `${leftPct}%`,
    "--nav-w": `${rightPct - leftPct}%`,
  } as ChartVarStyle;

  return { linePoints, windowStyle };
}
