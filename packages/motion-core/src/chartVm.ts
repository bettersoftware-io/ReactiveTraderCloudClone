/**
 * Structural stand-in for a framework style object carrying only CSS custom
 * properties (`--x`, `--top`, …). @rtc/motion-core is zero-dependency, so it
 * cannot import React's `CSSProperties` (the type the chartVm styles were
 * originally cast to); a `--*`-keyed record is what the values actually are,
 * and every framework's style prop (React's `CSSProperties`, Solid's
 * `JSX.CSSProperties`) accepts it structurally.
 */
export type ChartVarStyle = Readonly<Record<`--${string}`, string>>;

/**
 * The candle fields chartVm reads — a structural subset of @rtc/domain's
 * `Candle` (which motion-core, being zero-dependency, cannot import). Domain
 * `Candle` values satisfy it as-is; its extra `time` field is unused here
 * (candles are keyed by array index).
 */
export interface ChartCandle {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

const Y_SPAN = 86;
const Y_TOP = 6;
const BODY_FRAC = 0.64;
const HALF_BODY_FRAC = 0.32;
const MIN_BODY = 0.6;
const GRID_FRACTIONS = [0.2, 0.4, 0.6, 0.8];
const LABEL_FRACTIONS = [0.12, 0.37, 0.62, 0.87];

interface CandleVm {
  key: number;
  up: boolean;
  last: boolean;
  glow: boolean;
  style: ChartVarStyle;
  wickStyle: ChartVarStyle;
}

interface GridLineVm {
  key: number;
  style: ChartVarStyle;
}

interface PriceLabelVm {
  key: number;
  txt: string;
  style: ChartVarStyle;
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
  series: readonly ChartCandle[],
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
  series: readonly ChartCandle[],
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
    } as ChartVarStyle;
    const wickStyle = {
      "--wx": `calc(${x}% - 0.5px)`,
      "--wtop": `${yPct(cd.high)}%`,
      "--wh": `${yPct(cd.low) - yPct(cd.high)}%`,
    } as ChartVarStyle;

    return { key: i, up, last: isLast, glow, style, wickStyle };
  });

  const grid: GridLineVm[] = GRID_FRACTIONS.map((f, i) => {
    return { key: i, style: { "--gtop": `${f * 100}%` } as ChartVarStyle };
  });

  const labels: PriceLabelVm[] = LABEL_FRACTIONS.map((f, i) => {
    return {
      key: i,
      txt: (cmax - f * crng).toFixed(2),
      style: { "--ltop": `calc(${f * 100}% - 6px)` } as ChartVarStyle,
    };
  });

  return { candles, grid, labels };
}
