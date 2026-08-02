import type { ChartScene } from "@rtc/motion-core";
import { chartScene } from "@rtc/motion-core";

import { aaplCandles } from "../fixtures.js";

/** The engine's four geometry colors — no text is ever drawn, so this is the
 * whole palette a chart host needs to supply. */
export interface ChartPalette {
  readonly bodyUp: string;
  readonly bodyDown: string;
  readonly wick: string;
  readonly grid: string;
}

/** A framework-neutral default palette, used by spikeScene()'s host and any
 * caller that doesn't wire its own theme tokens through yet. */
export const SPIKE_PALETTE: ChartPalette = {
  bodyUp: "#2ec4b6",
  bodyDown: "#e63946",
  wick: "#8d99ae",
  grid: "#2b2d42",
};

/**
 * Framework-free Canvas-2D chart renderer: draws a ChartScene's geometry
 * (grid lines, candle wicks, candle bodies) onto a 2D context. Geometry
 * only — no text/label drawing (§5 of the seam spec); a chart host overlays
 * its own DOM/SVG text if it wants labels.
 *
 * `scene`'s numeric fields are percent (0-100) of the plot box; `size` gives
 * the pixel dimensions to scale them into.
 */
export function drawChartScene(
  ctx: CanvasRenderingContext2D,
  scene: ChartScene,
  palette: ChartPalette,
  size: { readonly w: number; readonly h: number },
): void {
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;

  for (const line of scene.grid) {
    const y = (line.top / 100) * size.h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size.w, y);
    ctx.stroke();
  }

  ctx.fillStyle = palette.wick;

  for (const cd of scene.candles) {
    ctx.fillRect(
      (cd.wickX / 100) * size.w - 0.5,
      (cd.wickTop / 100) * size.h,
      1,
      (cd.wickH / 100) * size.h,
    );
  }

  for (const cd of scene.candles) {
    ctx.fillStyle = cd.up ? palette.bodyUp : palette.bodyDown;
    const w = (cd.w / 100) * size.w;
    ctx.fillRect(
      (cd.x / 100) * size.w - w / 2,
      (cd.top / 100) * size.h,
      w,
      (cd.h / 100) * size.h,
    );
  }
}

/**
 * A deterministic ChartScene built from the same seeded AAPL candle series
 * the `equities-loaded` fixture renders (see fixtures.ts) — reused verbatim
 * rather than inventing a second candle set, so a canvas-host visual scenario
 * (Task 4) draws the exact same data the DOM/CSS chart does. liveRate is the
 * series' last close (no live overlay); flashOn is off; the viewport is the
 * whole series (chartScene's opts.viewport default).
 */
export function spikeScene(): ChartScene {
  const lastCandle = aaplCandles[aaplCandles.length - 1];
  const liveRate = lastCandle ? lastCandle.close : 0;
  return chartScene(aaplCandles, liveRate, false);
}
