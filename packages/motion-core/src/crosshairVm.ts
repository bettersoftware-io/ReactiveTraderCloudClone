import type { ChartViewport } from "./chartViewport.js";
import {
  type ChartCandle,
  type ChartScale,
  type ChartVarStyle,
  formatTimeLabel,
  Y_SPAN,
  Y_TOP,
} from "./chartVm.js";

/** Compact-volume threshold: at/above one million, render as "N.NM". */
const VOLUME_MILLION = 1_000_000;
/** Compact-volume threshold: at/above one thousand (and below one million),
 * render as "NK". */
const VOLUME_THOUSAND = 1_000;

/** The crosshair's snapped position plus its preformatted OHLCV readout. */
export interface CrosshairVm {
  readonly idx: number;
  readonly style: ChartVarStyle;
  readonly price: string;
  readonly readout: {
    readonly time: string;
    readonly open: string;
    readonly high: string;
    readonly low: string;
    readonly close: string;
    readonly volume: string;
  };
}

// Snaps the pointer's fractional plot position onto the nearest candle
// centre and reads its OHLCV back out, inverting the same Y_TOP/Y_SPAN
// mapping chartVm's yPct uses to place candle bodies. `viewport.end -
// viewport.start` is used unclamped (mirroring chartVm's resolveWindow),
// so a partially-scrolled viewport still maps xFrac correctly; the snapped
// index is separately clamped into the series so it never reads out of
// bounds.
export function crosshairVm(
  xFrac: number,
  yFrac: number,
  series: readonly ChartCandle[],
  viewport: ChartViewport,
  scale: ChartScale,
): CrosshairVm | null {
  if (series.length === 0) {
    return null;
  }

  const span = viewport.end - viewport.start || 1;
  const rawIdx = viewport.start + xFrac * span - 0.5;
  const idx = clamp(Math.round(rawIdx), 0, series.length - 1);
  const candle = series[idx];

  if (!candle) {
    return null;
  }

  const x = ((idx + 0.5 - viewport.start) / span) * 100;
  const y = yFrac * 100;
  const crng = scale.cmax - scale.cmin || 1;
  const price = scale.cmax - ((y - Y_TOP) / Y_SPAN) * crng;
  const bucketMs = series.length >= 2 ? bucketMsOf(series) : 0;

  return {
    idx,
    style: { "--chx": `${x}%`, "--chy": `${y}%` } as ChartVarStyle,
    price: price.toFixed(2),
    readout: {
      time: formatTimeLabel(candle.time, bucketMs),
      open: candle.open.toFixed(2),
      high: candle.high.toFixed(2),
      low: candle.low.toFixed(2),
      close: candle.close.toFixed(2),
      volume: compactVolume(candle.volume),
    },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function bucketMsOf(series: readonly ChartCandle[]): number {
  const first = series[0];
  const second = series[1];
  return first && second ? second.time - first.time : 0;
}

function compactVolume(v: number): string {
  if (v >= VOLUME_MILLION) {
    return `${(v / VOLUME_MILLION).toFixed(1)}M`;
  }

  if (v >= VOLUME_THOUSAND) {
    return `${(v / VOLUME_THOUSAND).toFixed(0)}K`;
  }

  return `${Math.round(v)}`;
}
