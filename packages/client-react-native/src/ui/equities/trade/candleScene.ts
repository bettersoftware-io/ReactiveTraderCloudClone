import type { Candle } from "@rtc/domain";

/** Smallest a doji's body may render at, so open === close still reads as a
 * bar rather than vanishing. */
const MIN_BODY_HEIGHT = 1;

/** Per-candle screen geometry, projected into a `width` × `height` canvas.
 * `x` is the horizontal centre of the candle's slot; body/wick width are a
 * caller-side constant (`barWidth` only sizes the slot spacing, not the
 * returned rect), so a Skia `<Rect>` renderer positions each shape around
 * `x` itself. */
export interface CandleBar {
  readonly x: number;
  readonly bodyTop: number;
  readonly bodyHeight: number;
  readonly wickTop: number;
  readonly wickHeight: number;
  readonly rising: boolean;
}

/** Project a candle series into draw-ready screen coordinates. Prices scale
 * against the series' own high/low (not per bar), so the series high always
 * touches `y = 0` and the series low always touches `y = height`. Candles are
 * laid out `barWidth` apart and right-aligned to `width`, so the most recent
 * candle sits flush against the right edge and older bars scroll off the
 * left as the series grows — the live-chart equivalent of the SVG version's
 * per-render rescale, without resizing already-drawn bars. A doji's body
 * (open === close) clamps to `MIN_BODY_HEIGHT` so it stays visible. Numeric
 * only — no Skia or React import — so it stays vitest-testable and reusable. */
/** One slot's body rectangle, the pair of numbers the 0.5s body morph
 * interpolates (the design transitions only `top`/`height` — dc.html:378;
 * wicks, x and colour snap). */
export interface BodyGeometry {
  readonly top: number;
  readonly height: number;
}

/** A scene's body geometries re-indexed by SLOT, newest bar = slot 0. The
 * morph pairs by screen position, not by candle identity: the design's
 * transition lives on a fixed slot div whose values change (dc.html:377), so
 * a tick that shifts the series left morphs every slot to its neighbour's
 * geometry, and a symbol switch morphs the whole chart shape-to-shape. */
export function bodyGeometriesBySlot(
  bars: readonly CandleBar[],
): readonly BodyGeometry[] {
  return bars.map((_, i) => {
    const bar = bars[bars.length - 1 - i];

    return { top: bar.bodyTop, height: bar.bodyHeight };
  });
}

/** Where a running morph currently stands, slot by slot — used to retarget a
 * new morph from the geometry actually on screen (CSS-transition semantics)
 * rather than teleporting back to the previous target. A slot `from` lacks
 * (the series grew) starts at its target, i.e. it snaps. */
export function lerpBodyGeometries(
  from: readonly BodyGeometry[],
  to: readonly BodyGeometry[],
  progress: number,
): readonly BodyGeometry[] {
  return to.map((target, slot) => {
    const start = from[slot] ?? target;

    return {
      top: start.top + (target.top - start.top) * progress,
      height: start.height + (target.height - start.height) * progress,
    };
  });
}

export function buildCandleScene(
  candles: readonly Candle[],
  width: number,
  height: number,
  barWidth: number,
): readonly CandleBar[] {
  if (candles.length === 0) {
    return [];
  }

  const highs = candles.map((candle) => {
    return candle.high;
  });

  const lows = candles.map((candle) => {
    return candle.low;
  });
  const seriesHigh = Math.max(...highs);
  const seriesLow = Math.min(...lows);
  const range = seriesHigh - seriesLow || 1;

  function toY(price: number): number {
    return ((seriesHigh - price) / range) * height;
  }

  const rightEdge = width - barWidth / 2;
  const startX = rightEdge - (candles.length - 1) * barWidth;

  return candles.map((candle, i) => {
    const bodyTop = toY(Math.max(candle.open, candle.close));
    const bodyBottom = toY(Math.min(candle.open, candle.close));
    const wickTop = toY(candle.high);
    const wickBottom = toY(candle.low);

    return {
      x: startX + i * barWidth,
      bodyTop,
      bodyHeight: Math.max(MIN_BODY_HEIGHT, bodyBottom - bodyTop),
      wickTop,
      wickHeight: wickBottom - wickTop,
      rising: candle.close >= candle.open,
    };
  });
}
