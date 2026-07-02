import type { CSSProperties } from "react";

import type { Candle } from "#/equities/types";

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

export interface GridLineVm {
  key: number;
  style: CSSProperties;
}

export interface PriceLabelVm {
  key: number;
  txt: string;
  style: CSSProperties;
}

export interface ChartVm {
  candles: CandleVm[];
  grid: GridLineVm[];
  labels: PriceLabelVm[];
}

interface LiveCandle {
  o: number;
  h: number;
  l: number;
  c: number;
}

// The stored series is immutable; the last candle is overlaid with the live
// price at render (spec §3): close = rate, high/low stretch to include it.
function withLiveLast(series: Candle[], liveRate: number): LiveCandle[] {
  return series.map((cd, i) => {
    if (i !== series.length - 1) {
      return cd;
    }

    return {
      o: cd.o,
      c: liveRate,
      h: Math.max(cd.h, liveRate),
      l: Math.min(cd.l, liveRate),
    };
  });
}

// PROTO L1343-1345: y maps a price into [6%, 92%] of the plot, inverted (high
// at the top); each candle body is 64% of a column wide, its wick 1px.
export function chartVm(
  series: Candle[],
  liveRate: number,
  flashOn: boolean,
): ChartVm {
  const candlesIn = withLiveLast(series, liveRate);
  const cmin = Math.min(
    ...candlesIn.map((c) => {
      return c.l;
    }),
  );
  const cmax = Math.max(
    ...candlesIn.map((c) => {
      return c.h;
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
    const up = cd.c >= cd.o;
    const yo = yPct(cd.o);
    const yc = yPct(cd.c);
    const top = Math.min(yo, yc);
    const bodyH = Math.max(MIN_BODY, Math.abs(yo - yc));
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
      "--wtop": `${yPct(cd.h)}%`,
      "--wh": `${yPct(cd.l) - yPct(cd.h)}%`,
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
