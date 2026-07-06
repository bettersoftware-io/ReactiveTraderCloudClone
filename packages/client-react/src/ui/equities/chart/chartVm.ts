import type { CSSProperties } from "react";

import type { Candle } from "@rtc/domain";

const Y_SPAN = 86;
const Y_TOP = 6;
const BODY_FRAC = 0.64;
const HALF_BODY_FRAC = 0.32;
const MIN_BODY = 0.6;
const GRID_FRACTIONS = [0.2, 0.4, 0.6, 0.8];
const LABEL_FRACTIONS = [0.12, 0.37, 0.62, 0.87];

export interface CandleVm {
  key: number;
  up: boolean;
  last: boolean;
  glow: boolean;
  style: CSSProperties;
  wickStyle: CSSProperties;
}

interface GridLineVm {
  key: number;
  style: CSSProperties;
}

interface PriceLabelVm {
  key: number;
  txt: string;
  style: CSSProperties;
}

export interface ChartVm {
  candles: readonly CandleVm[];
  grid: readonly GridLineVm[];
  labels: readonly PriceLabelVm[];
}

interface LiveCandle {
  open: number;
  high: number;
  low: number;
  close: number;
}

// The stored series is immutable; the last candle is overlaid with the live
// price at render (PROTO chartVm withLiveLast, §3 "the last candle is
// overlaid with the live price"): close = liveRate, high/low stretch to
// include it. Ported to the domain Candle's open/high/low/close field names.
function withLiveLast(
  series: readonly Candle[],
  liveRate: number,
): readonly LiveCandle[] {
  return series.map((candle, i) => {
    if (i !== series.length - 1) {
      return candle;
    }

    return {
      open: candle.open,
      close: liveRate,
      high: Math.max(candle.high, liveRate),
      low: Math.min(candle.low, liveRate),
    };
  });
}

// PROTO L1343-1345: y maps a price into [6%, 92%] of the plot, inverted (high
// at the top); each candle body is 64% of a column wide, its wick 1px.
export function chartVm(
  series: readonly Candle[],
  liveRate: number,
  flashOn: boolean,
): ChartVm {
  if (series.length === 0) {
    return { candles: [], grid: [], labels: [] };
  }

  const candlesIn = withLiveLast(series, liveRate);
  const cmin = Math.min(
    ...candlesIn.map((c) => {
      return c.low;
    }),
  );
  const cmax = Math.max(
    ...candlesIn.map((c) => {
      return c.high;
    }),
  );
  const crng = cmax - cmin || 1;
  const n = candlesIn.length;
  const cw = 100 / n;

  function yPct(p: number): number {
    return ((cmax - p) / crng) * Y_SPAN + Y_TOP;
  }

  const candles: CandleVm[] = candlesIn.map((cd, i) => {
    const x = (i + 0.5) * cw;
    const up = cd.close >= cd.open;
    const yOpen = yPct(cd.open);
    const yClose = yPct(cd.close);
    const top = Math.min(yOpen, yClose);
    const bodyH = Math.max(MIN_BODY, Math.abs(yOpen - yClose));
    const isLast = i === n - 1;
    const glow = isLast && flashOn;
    const style = {
      "--x": `${x}%`,
      "--top": `${top}%`,
      "--h": `${bodyH}%`,
      "--w": `${cw * BODY_FRAC}%`,
      "--wleft-offset": `${cw * HALF_BODY_FRAC}%`,
    } as CSSProperties;
    const wickStyle = {
      "--wx": `calc(${x}% - 0.5px)`,
      "--wtop": `${yPct(cd.high)}%`,
      "--wh": `${yPct(cd.low) - yPct(cd.high)}%`,
    } as CSSProperties;

    return { key: i, up, last: isLast, glow, style, wickStyle };
  });

  const grid: GridLineVm[] = GRID_FRACTIONS.map((f, i) => {
    return { key: i, style: { "--gtop": `${f * 100}%` } as CSSProperties };
  });

  const labels: PriceLabelVm[] = LABEL_FRACTIONS.map((f, i) => {
    return {
      key: i,
      txt: (cmax - f * crng).toFixed(2),
      style: { "--ltop": `calc(${f * 100}% - 6px)` } as CSSProperties,
    };
  });

  return { candles, grid, labels };
}
