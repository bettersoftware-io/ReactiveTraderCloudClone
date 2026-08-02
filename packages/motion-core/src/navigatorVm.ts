import { navigatorWindowStyleFromScene } from "./chartCssVars.js";
import type { ChartPoint, ChartVarStyle } from "./chartScene.js";
import { navigatorWindowScene } from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";

/** The candle fields the navigator vm reads — a structural subset of
 * @rtc/domain's `Candle` (motion-core is zero-dependency); only the close
 * matters for the overview line. */
export interface NavigatorCandle {
  readonly close: number;
}

export interface NavigatorVm {
  /** Full-series close polyline on the 0–100 grid — see
   * {@link navigatorLinePoints}. */
  readonly linePoints: readonly ChartPoint[];
  /** The viewport window as strip CSS vars — see
   * {@link navigatorWindowStyle}. */
  readonly windowStyle: ChartVarStyle;
}

/** Strip-local y padding (the plot's Y_TOP/Y_SPAN belong to its own box). */
const NAV_Y_TOP = 10;
const NAV_Y_SPAN = 80;

/**
 * The navigator strip's full-series close polyline on the 0–100 grid.
 * x maps each index to its candle-slot CENTRE (`(i + 0.5) / len × 100`) —
 * the same slot space {@link navigatorWindowStyle} uses for the window, so
 * the shade and the line register exactly (slot-centre mapping also makes a
 * single-candle series land at x = 50 with no special case). y maps
 * [min, max] close into the padded band, inverted (high at the top).
 *
 * Split out of {@link navigatorVm} because the two halves change at very
 * different rates: this one only when the SERIES changes (a new candle,
 * ~once a bucket), the window style on every pointer-move of a brush drag.
 * Consumers memoize this on the series alone so a continuous drag never
 * re-maps the full history per frame.
 */
export function navigatorLinePoints(
  series: readonly NavigatorCandle[],
): readonly ChartPoint[] {
  const len = series.length;

  if (len === 0) {
    return [];
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

  return closes.map((close, i) => {
    return {
      x: ((i + 0.5) / len) * 100,
      y: flat
        ? NAV_Y_TOP + NAV_Y_SPAN / 2
        : ((max - close) / rng) * NAV_Y_SPAN + NAV_Y_TOP,
    };
  });
}

/**
 * The viewport window as strip CSS vars: `--nav-left` / `--nav-w`,
 * percentages of the series length in candle-slot space (`start / len`,
 * `(end − start) / len`), so the shade covers exactly the candles the plot
 * shows. The cheap, per-pointer-move half of the navigator vm — see
 * {@link navigatorLinePoints} for the split rationale.
 */
export function navigatorWindowStyle(
  viewport: ChartViewport,
  seriesLen: number,
): ChartVarStyle {
  return navigatorWindowStyleFromScene(
    navigatorWindowScene(viewport, seriesLen),
  );
}

/** The composed navigator vm — {@link navigatorLinePoints} +
 * {@link navigatorWindowStyle} in one call, for static consumers (the visual
 * tier's forced-state wrappers) that don't care about the two halves' change
 * rates. Live chart shells call the halves directly and memoize the line on
 * the series alone. */
export function navigatorVm(
  series: readonly NavigatorCandle[],
  viewport: ChartViewport,
): NavigatorVm {
  return {
    linePoints: navigatorLinePoints(series),
    windowStyle: navigatorWindowStyle(viewport, series.length),
  };
}
