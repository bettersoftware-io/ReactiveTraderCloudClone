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
