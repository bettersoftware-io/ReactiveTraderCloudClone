import type { Candle } from "@rtc/domain";

export const CANDLE_WIDTH = 300;
export const CANDLE_HEIGHT = 160;
const PAD_X = 2;
const PAD_Y = 4;

export interface CandleGeom {
  readonly x: number;
  readonly barW: number;
  readonly wickTop: number;
  readonly wickBottom: number;
  readonly bodyY: number;
  readonly bodyH: number;
  readonly up: boolean;
}

/** Candlestick geometry for SVG. Verbatim port of the web canvas `drawCandles`
 * math (same padding, slot width, 0.6 body ratio, min/max scaling), returning
 * per-candle geometry instead of drawing — the SVG leaf renders it. */
export function buildCandles(
  candles: readonly Candle[],
  w: number = CANDLE_WIDTH,
  h: number = CANDLE_HEIGHT,
): readonly CandleGeom[] {
  if (candles.length === 0) return [];

  const allPrices = candles.flatMap((c) => {
    return [c.high, c.low];
  });
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const range = max - min || 1;

  const plotW = w - PAD_X * 2;
  const plotH = h - PAD_Y * 2;
  const slotW = plotW / candles.length;
  const barW = Math.max(1, slotW * 0.6);

  function toY(price: number): number {
    return PAD_Y + (1 - (price - min) / range) * plotH;
  }

  return candles.map((c, i) => {
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    return {
      x: PAD_X + i * slotW + slotW / 2,
      barW,
      wickTop: toY(c.high),
      wickBottom: toY(c.low),
      bodyY: bodyTop,
      bodyH: Math.max(1, bodyBot - bodyTop),
      up: c.close >= c.open,
    };
  });
}
