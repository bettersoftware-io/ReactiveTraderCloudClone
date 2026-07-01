// Pure canvas draw function for candlestick charts — no React, no DOM state.
// Pattern mirrors bootCanvas.ts: exported helper called in a useLayoutEffect;
// the component owns the rAF/effect lifecycle.

import type { Candle } from "@rtc/domain";

export interface CandleColors {
  readonly positive: string;
  readonly negative: string;
}

/**
 * Draw a candlestick chart onto the given 2D context.
 * Called from PriceChart's useLayoutEffect when `candles` changes.
 * No requestAnimationFrame — redraw-on-data-change, not continuous loop.
 */
export function drawCandles(
  ctx: CanvasRenderingContext2D,
  candles: readonly Candle[],
  w: number,
  h: number,
  colors: CandleColors,
): void {
  ctx.clearRect(0, 0, w, h);
  if (candles.length === 0) return;

  const allPrices = candles.flatMap((c) => {
    return [c.high, c.low];
  });
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const range = max - min || 1;

  const padX = 2;
  const padY = 4;
  const plotW = w - padX * 2;
  const plotH = h - padY * 2;
  const slotW = plotW / candles.length;
  const barW = Math.max(1, slotW * 0.6);

  function toY(price: number): number {
    return padY + (1 - (price - min) / range) * plotH;
  }

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const cx = padX + i * slotW + slotW / 2;
    const isUp = c.close >= c.open;
    const color = isUp ? colors.positive : colors.negative;

    // Wick (high-to-low line)
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, toY(c.high));
    ctx.lineTo(cx, toY(c.low));
    ctx.stroke();

    // Body (open-to-close rectangle)
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    const bodyH = Math.max(1, bodyBot - bodyTop);
    ctx.fillStyle = color;
    ctx.fillRect(cx - barW / 2, bodyTop, barW, bodyH);
  }
}
