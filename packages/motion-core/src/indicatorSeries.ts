import { priceToY } from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";
import type { ChartPoint, ChartScale } from "./chartVm.js";

/** The two indicator overlays the chart can plot: a 20-period simple moving
 * average and a 50-period exponential moving average. */
export type IndicatorId = "sma20" | "ema50";

/** An indicator's recurrence kind and lookback window. */
export interface IndicatorDef {
  readonly kind: "sma" | "ema";
  readonly window: number;
}

/** Each indicator's kind (which recurrence to run) and lookback window. */
export const INDICATOR_DEFS: Readonly<Record<IndicatorId, IndicatorDef>> = {
  sma20: { kind: "sma", window: 20 },
  ema50: { kind: "ema", window: 50 },
};

/** Computes the indicator's value at every close index: `null` through its
 * warm-up (the first `window - 1` indices), then a real value from index
 * `window - 1` onward. SMA is the rolling mean; EMA is seeded with the SMA
 * of the first `window` closes at index `window - 1`, then k-weighted
 * (`k = 2 / (window + 1)`) against the previous EMA thereafter. */
export function indicatorValues(
  closes: readonly number[],
  id: IndicatorId,
): readonly (number | null)[] {
  const def = INDICATOR_DEFS[id];
  return def.kind === "sma"
    ? smaValues(closes, def.window)
    : emaValues(closes, def.window);
}

/** Projects an indicator's value series into viewport-relative plot points,
 * skipping null warm-up entries. Uses the exact same x/y mapping as
 * chartVm's line/area points, so an overlay lines up pixel-for-pixel with
 * the price series it is drawn against. */
export function indicatorPoints(
  values: readonly (number | null)[],
  viewport: ChartViewport,
  scale: ChartScale,
): readonly ChartPoint[] {
  const iFirst = Math.max(0, Math.floor(viewport.start));
  const iLast = Math.min(values.length - 1, Math.ceil(viewport.end) - 1);
  const span = viewport.end - viewport.start || 1;
  const points: ChartPoint[] = [];

  for (let i = iFirst; i <= iLast; i++) {
    const value = values[i];

    if (value === null || value === undefined) {
      continue;
    }

    points.push({
      x: ((i + 0.5 - viewport.start) / span) * 100,
      y: priceToY(scale, value),
    });
  }

  return points;
}

function smaValues(
  closes: readonly number[],
  window: number,
): readonly (number | null)[] {
  const values: (number | null)[] = [];
  let sum = 0;

  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];

    if (i >= window) {
      sum -= closes[i - window];
    }

    values.push(i >= window - 1 ? sum / window : null);
  }

  return values;
}

function emaValues(
  closes: readonly number[],
  window: number,
): readonly (number | null)[] {
  const seedIndex = window - 1;
  const k = 2 / (window + 1);
  const values: (number | null)[] = [];
  let prev: number | null = null;

  for (let i = 0; i < closes.length; i++) {
    if (i < seedIndex) {
      values.push(null);
      continue;
    }

    const close = closes[i];

    if (i === seedIndex) {
      const seed =
        closes.slice(0, window).reduce((sum, c) => {
          return sum + c;
        }, 0) / window;
      values.push(seed);
      prev = seed;
      continue;
    }

    const ema: number = close * k + (prev ?? 0) * (1 - k);
    values.push(ema);
    prev = ema;
  }

  return values;
}
