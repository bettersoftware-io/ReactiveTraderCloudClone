import type { ChartViewport } from "./chartViewport.js";

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
 * `Candle` values satisfy it as-is. Candles are keyed by array index; `time`
 * drives the time-axis labels, `volume` the volume-vm bar heights.
 */
export interface ChartCandle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Chart series' plot style: candlesticks, or a close-price line/area. */
export type ChartKind = "candles" | "line" | "area";

/** A single plotted point, in percent coordinates (0–100) of the plot box. */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** The visible-slice price range (post live-overlay) a ChartVm was fit to. */
export interface ChartScale {
  readonly cmin: number;
  readonly cmax: number;
}

/** A time-axis tick, keyed to the series index it labels (stable while
 * panning) rather than to its position within the current viewport. */
export interface TimeLabelVm {
  readonly key: number;
  readonly txt: string;
  readonly style: ChartVarStyle;
}

export interface ChartVmOptions {
  /** Visible candle-index window; default: the whole series (back-compat). */
  readonly viewport?: ChartViewport;
  /** Plot style; default "candles". */
  readonly kind?: ChartKind;
}

/** A volume bar, scaled to the visible slice's max volume. */
export interface VolumeBarVm {
  readonly key: number;
  readonly up: boolean;
  readonly style: ChartVarStyle;
}

/** Shared Y-mapping constants: price maps into [Y_TOP%, (Y_TOP+Y_SPAN)%] of
 * the plot box, inverted (high at the top). Exported for crosshairVm (Task
 * B3), which must land the crosshair on the same price-to-pixel mapping. */
export const Y_TOP = 6;
export const Y_SPAN = 86;
const BODY_FRAC = 0.64;
const HALF_BODY_FRAC = 0.32;
const MIN_BODY = 0.6;
const GRID_FRACTIONS = [0.2, 0.4, 0.6, 0.8];
const LABEL_FRACTIONS = [0.12, 0.37, 0.62, 0.87];
const DAY_MS = 24 * 60 * 60 * 1000;
const LABEL_TARGET_DIVISOR = 5;
const STEP_CANDIDATES: readonly number[] = [1, 2, 5, 10, 15, 30, 60, 120];
const MONTHS: readonly string[] = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

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
  linePoints: readonly ChartPoint[];
  timeLabels: readonly TimeLabelVm[];
  scale: ChartScale;
}

// PROTO L1343-1345: y maps a price into [6%, 92%] of the plot, inverted (high
// at the top); each candle body is 64% of a column wide, its wick 1px.
export function chartVm(
  series: readonly ChartCandle[],
  liveRate: number,
  flashOn: boolean,
  opts?: ChartVmOptions,
): ChartVm {
  if (series.length === 0) {
    return {
      candles: [],
      grid: [],
      labels: [],
      linePoints: [],
      timeLabels: [],
      scale: { cmin: 0, cmax: 0 },
    };
  }

  const kind = opts?.kind ?? "candles";
  const win = resolveWindow(opts?.viewport, series.length);
  const candlesIn = withLiveLast(series, liveRate);
  const visible = candlesIn.slice(win.iFirst, win.iLast + 1);
  const lastIndex = series.length - 1;

  const cmin = Math.min(
    ...visible.map((c) => {
      return c.low;
    }),
  );

  const cmax = Math.max(
    ...visible.map((c) => {
      return c.high;
    }),
  );
  const crng = cmax - cmin || 1;
  const cw = 100 / win.span;

  function yPct(p: number): number {
    return ((cmax - p) / crng) * Y_SPAN + Y_TOP;
  }

  const candles: CandleVm[] =
    kind === "candles"
      ? visible.map((cd, offset) => {
          const i = win.iFirst + offset;
          return candleGeometry(cd, i, win, cw, yPct, i === lastIndex, flashOn);
        })
      : [];

  const linePoints: ChartPoint[] =
    kind === "candles"
      ? []
      : visible.map((cd, offset) => {
          const i = win.iFirst + offset;
          return { x: xPct(i, win.vp, win.span), y: yPct(cd.close) };
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

  const timeLabels = buildTimeLabels(series, win);

  return {
    candles,
    grid,
    labels,
    linePoints,
    timeLabels,
    scale: { cmin, cmax },
  };
}

export function volumeVm(
  series: readonly ChartCandle[],
  viewport?: ChartViewport,
): readonly VolumeBarVm[] {
  if (series.length === 0) {
    return [];
  }

  const win = resolveWindow(viewport, series.length);
  const visible = series.slice(win.iFirst, win.iLast + 1);
  const cw = 100 / win.span;

  const maxVolume =
    Math.max(
      ...visible.map((c) => {
        return c.volume;
      }),
    ) || 1;

  return visible.map((cd, offset) => {
    const i = win.iFirst + offset;
    const x = xPct(i, win.vp, win.span);
    const h = (cd.volume / maxVolume) * 100;
    const up = cd.close >= cd.open;
    const style = {
      "--x": `${x}%`,
      "--w": `${cw * BODY_FRAC}%`,
      "--h": `${h}%`,
    } as ChartVarStyle;
    return { key: i, up, style };
  });
}

interface ChartWindow {
  readonly vp: ChartViewport;
  readonly iFirst: number;
  readonly iLast: number;
  readonly span: number;
}

// Resolves the effective slice window: an omitted viewport defaults to the
// whole series (the back-compat case, where span === seriesLen); iFirst/iLast
// are the clamped candle indices to slice, while `span` — used for x-mapping
// and column width — stays the raw (unclamped) viewport span so edge candles
// land partially outside [0,100] instead of being squeezed to fit.
function resolveWindow(
  viewport: ChartViewport | undefined,
  seriesLen: number,
): ChartWindow {
  const vp = viewport ?? { start: 0, end: seriesLen };
  const iFirst = Math.max(0, Math.floor(vp.start));
  const iLast = Math.min(seriesLen - 1, Math.ceil(vp.end) - 1);
  const span = vp.end - vp.start || 1;
  return { vp, iFirst, iLast, span };
}

function xPct(i: number, vp: ChartViewport, span: number): number {
  return ((i + 0.5 - vp.start) / span) * 100;
}

// The stored series is immutable; the last candle is overlaid with the live
// price at render (PROTO chartVm withLiveLast, §3 "the last candle is
// overlaid with the live price"): close = liveRate, high/low stretch to
// include it. Ported to the domain Candle's open/high/low/close field names.
function withLiveLast(
  series: readonly ChartCandle[],
  liveRate: number,
): readonly ChartCandle[] {
  return series.map((candle, i) => {
    if (i !== series.length - 1) {
      return candle;
    }

    return {
      ...candle,
      close: liveRate,
      high: Math.max(candle.high, liveRate),
      low: Math.min(candle.low, liveRate),
    };
  });
}

function candleGeometry(
  cd: ChartCandle,
  i: number,
  win: ChartWindow,
  cw: number,
  yPct: (p: number) => number,
  isLast: boolean,
  flashOn: boolean,
): CandleVm {
  const x = xPct(i, win.vp, win.span);
  const up = cd.close >= cd.open;
  const yOpen = yPct(cd.open);
  const yClose = yPct(cd.close);
  const top = Math.min(yOpen, yClose);
  const bodyH = Math.max(MIN_BODY, Math.abs(yOpen - yClose));
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
}

// Time-axis ticks target ~4-6 labels across the visible window: step to the
// nearest "nice" candle interval, then label every series index (not
// window-relative offset) that's a multiple of it — keeping the same
// absolute indices labelled while panning, so consecutive windows overlap.
function buildTimeLabels(
  series: readonly ChartCandle[],
  win: ChartWindow,
): readonly TimeLabelVm[] {
  if (series.length < 2) {
    return [];
  }

  const first = series[0];
  const second = series[1];

  if (!first || !second) {
    return [];
  }

  const bucketMs = second.time - first.time;
  const step = roundStepUp(Math.ceil(win.span / LABEL_TARGET_DIVISOR));
  const labels: TimeLabelVm[] = [];

  for (let i = win.iFirst; i <= win.iLast; i++) {
    if (i % step !== 0) {
      continue;
    }

    const candle = series[i];

    if (!candle) {
      continue;
    }

    const x = xPct(i, win.vp, win.span);
    labels.push({
      key: i,
      txt: formatTimeLabel(candle.time, bucketMs),
      style: { "--tx": `${x}%` } as ChartVarStyle,
    });
  }

  return labels;
}

function roundStepUp(x: number): number {
  for (const candidate of STEP_CANDIDATES) {
    if (candidate >= x) {
      return candidate;
    }
  }

  return STEP_CANDIDATES[STEP_CANDIDATES.length - 1] ?? 1;
}

function formatTimeLabel(timeMs: number, bucketMs: number): string {
  const d = new Date(timeMs);

  if (bucketMs < DAY_MS) {
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${dd} ${MONTHS[d.getUTCMonth()]}`;
}
