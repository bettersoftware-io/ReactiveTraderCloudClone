import type { ChartViewport } from "./chartViewport.js";
import { priceTicks } from "./priceTicks.js";

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

/** The visible-slice price range (post live-overlay) a ChartVm was fit to.
 * `yScale` is the y-mapping mode; absent = linear (room for "percent" when
 * comparison series lands). */
export interface ChartScale {
  readonly cmin: number;
  readonly cmax: number;
  readonly yScale?: "log";
}

export interface ChartVmOptions {
  /** Visible candle-index window; default: the whole series (back-compat). */
  readonly viewport?: ChartViewport;
  /** Plot style; default "candles". */
  readonly kind?: ChartKind;
  /** Price-axis mapping; default "linear". */
  readonly yScale?: "linear" | "log";
}

/** Shared Y-mapping constants: price maps into [Y_TOP%, (Y_TOP+Y_SPAN)%] of
 * the plot box, inverted (high at the top). Exported for crosshairVm (Task
 * B3), which must land the crosshair on the same price-to-pixel mapping. */
export const Y_TOP = 6;
export const Y_SPAN = 86;

/** price → % of the plot box, into [Y_TOP, Y_TOP + Y_SPAN], inverted (high
 * at the top). The ONLY price→y mapping in the codebase: candle geometry,
 * crosshair inversion, and indicator overlays all route through it, so a
 * scale-mode change cannot desynchronize them. Log mode interpolates in
 * log10 space; a non-positive cmin falls back to the linear branch (keeps
 * the math total — equities prices cannot reach it). */
export function priceToY(scale: ChartScale, price: number): number {
  if (scale.yScale === "log" && scale.cmin > 0) {
    const lmax = Math.log10(scale.cmax);
    const lrng = lmax - Math.log10(scale.cmin) || 1;
    return ((lmax - Math.log10(price)) / lrng) * Y_SPAN + Y_TOP;
  }

  const crng = scale.cmax - scale.cmin || 1;
  return ((scale.cmax - price) / crng) * Y_SPAN + Y_TOP;
}

/** Exact inverse of {@link priceToY} — same branch rules. */
export function yToPrice(scale: ChartScale, y: number): number {
  if (scale.yScale === "log" && scale.cmin > 0) {
    const lmax = Math.log10(scale.cmax);
    const lrng = lmax - Math.log10(scale.cmin) || 1;
    return 10 ** (lmax - ((y - Y_TOP) / Y_SPAN) * lrng);
  }

  const crng = scale.cmax - scale.cmin || 1;
  return scale.cmax - ((y - Y_TOP) / Y_SPAN) * crng;
}

const BODY_FRAC = 0.64;
const MIN_BODY = 0.6;
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

/** Shared UTC time-label formatter: HH:MM when the series' candle bucket is
 * under a day, DD-MMM (upper-case) otherwise. Exported (not just used by
 * `buildTimeLabels` below) so crosshairVm (Task B3) formats its readout's
 * time string with the exact same rule instead of a drifting second copy. */
export function formatTimeLabel(timeMs: number, bucketMs: number): string {
  const d = new Date(timeMs);

  if (bucketMs < DAY_MS) {
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${dd} ${MONTHS[d.getUTCMonth()]}`;
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

function roundStepUp(x: number): number {
  for (const candidate of STEP_CANDIDATES) {
    if (candidate >= x) {
      return candidate;
    }
  }

  return STEP_CANDIDATES[STEP_CANDIDATES.length - 1] ?? 1;
}

/** A single candle's numeric geometry — the scene-side twin of
 * `CandleVm`/`--x`/`--top`/etc., before any CSS-var projection. `wickX`
 * equals `x`; the projection's `-0.5px` nudge is a rendering detail, not
 * scene content. */
export interface SceneCandle {
  readonly key: number;
  readonly up: boolean;
  readonly last: boolean;
  readonly glow: boolean;
  readonly x: number; // column center, % of plot box
  readonly top: number; // body top
  readonly h: number; // body height
  readonly w: number; // body width
  readonly wickX: number; // == x; the -0.5px nudge is projection-side
  readonly wickTop: number;
  readonly wickH: number;
}

export interface SceneGridLine {
  readonly key: number;
  readonly top: number;
}

export interface SceneLabel {
  readonly key: number;
  readonly txt: string;
  /** Price labels position by `top`, time labels by `x`; the unused axis is 0. */
  readonly top: number;
  readonly x: number;
}

export interface VolumeSceneBar {
  readonly key: number;
  readonly up: boolean;
  readonly x: number;
  readonly w: number;
  readonly h: number;
}

export interface ChartScene {
  readonly kind: ChartKind;
  readonly candles: readonly SceneCandle[];
  readonly grid: readonly SceneGridLine[];
  readonly priceLabels: readonly SceneLabel[];
  readonly timeLabels: readonly SceneLabel[];
  readonly linePoints: readonly ChartPoint[];
  readonly scale: ChartScale;
}

function candleGeometry(
  cd: ChartCandle,
  i: number,
  win: ChartWindow,
  cw: number,
  yPct: (p: number) => number,
  isLast: boolean,
  flashOn: boolean,
): SceneCandle {
  const x = xPct(i, win.vp, win.span);
  const up = cd.close >= cd.open;
  const yOpen = yPct(cd.open);
  const yClose = yPct(cd.close);
  const top = Math.min(yOpen, yClose);
  const bodyH = Math.max(MIN_BODY, Math.abs(yOpen - yClose));
  const glow = isLast && flashOn;

  return {
    key: i,
    up,
    last: isLast,
    glow,
    x,
    top,
    h: bodyH,
    w: cw * BODY_FRAC,
    wickX: x,
    wickTop: yPct(cd.high),
    wickH: yPct(cd.low) - yPct(cd.high),
  };
}

// Time-axis ticks target ~4-6 labels across the visible window: step to the
// nearest "nice" candle interval, then label every series index (not
// window-relative offset) that's a multiple of it — keeping the same
// absolute indices labelled while panning, so consecutive windows overlap.
function buildTimeLabels(
  series: readonly ChartCandle[],
  win: ChartWindow,
): readonly SceneLabel[] {
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
  const labels: SceneLabel[] = [];

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
      top: 0,
      x,
    });
  }

  return labels;
}

// PROTO L1343-1345: y maps a price into [6%, 92%] of the plot, inverted (high
// at the top); each candle body is 64% of a column wide, its wick 1px.
export function chartScene(
  series: readonly ChartCandle[],
  liveRate: number,
  flashOn: boolean,
  opts?: ChartVmOptions,
): ChartScene {
  const kind = opts?.kind ?? "candles";

  if (series.length === 0) {
    return {
      kind,
      candles: [],
      grid: [],
      priceLabels: [],
      timeLabels: [],
      linePoints: [],
      scale: { cmin: 0, cmax: 0 },
    };
  }

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
  const cw = 100 / win.span;

  const scale: ChartScale =
    opts?.yScale === "log" ? { cmin, cmax, yScale: "log" } : { cmin, cmax };

  function yPct(p: number): number {
    return priceToY(scale, p);
  }

  const candles: SceneCandle[] =
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

  // Grid and labels are the same tick list viewed twice: one line and one
  // label per nice tick, both at priceToY(scale, tick), highest price first
  // (the old top-down reading order). The label projection's −6px calc
  // (chartCssVars) centers each 12px label on its line.
  const ticks = [...priceTicks(cmin, cmax)].reverse();

  const grid: SceneGridLine[] = ticks.map((t, i) => {
    return { key: i, top: yPct(t) };
  });

  const priceLabels: SceneLabel[] = ticks.map((t, i) => {
    return { key: i, txt: t.toFixed(2), top: yPct(t), x: 0 };
  });

  const timeLabels = buildTimeLabels(series, win);

  return {
    kind,
    candles,
    grid,
    priceLabels,
    timeLabels,
    linePoints,
    scale,
  };
}

/** Compact-volume threshold: at/above one million, render as "N.NM". */
const VOLUME_MILLION = 1_000_000;
/** Compact-volume threshold: at/above one thousand (and below one million),
 * render as "NK". */
const VOLUME_THOUSAND = 1_000;

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

/** The crosshair's snapped position, in numeric plot-percent coordinates,
 * plus its preformatted OHLCV readout — the scene-side twin of
 * `CrosshairVm`/`--chx`/`--chy`, before any CSS-var projection. `price` and
 * `readout`'s fields are preformatted label text (2dp price/OHLC, HH:MM or
 * DD-MMM time, compact volume) rather than raw numbers: they are the
 * candle's *display* values, already rounded/compacted for a fixed-width
 * readout, so keeping them as scene content (not projection output) avoids a
 * second copy of that formatting rule at the projection layer. Neither
 * contains `%` or `calc(`, so the CSS-neutrality rule still holds. */
export interface CrosshairScene {
  readonly idx: number;
  readonly x: number; // column center, % of plot box
  readonly y: number; // % of plot box
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
// mapping chartScene's yPct uses to place candle bodies. `viewport.end -
// viewport.start` is used unclamped (mirroring chartScene's resolveWindow),
// so a partially-scrolled viewport still maps xFrac correctly; the snapped
// index is separately clamped into the series so it never reads out of
// bounds.
export function crosshairScene(
  xFrac: number,
  yFrac: number,
  series: readonly ChartCandle[],
  viewport: ChartViewport,
  scale: ChartScale,
): CrosshairScene | null {
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
  const price = yToPrice(scale, y);
  const bucketMs = series.length >= 2 ? bucketMsOf(series) : 0;

  return {
    idx,
    x,
    y,
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

/** The navigator strip's viewport window, in numeric percentages of the
 * series length — the scene-side twin of `--nav-left`/`--nav-w`, before any
 * CSS-var projection. */
export interface NavigatorWindowScene {
  readonly left: number;
  readonly w: number;
}

/**
 * The viewport window as numeric percentages of the series length in
 * candle-slot space (`start / len`, `(end − start) / len`), so the window
 * covers exactly the candles the plot shows. No clamp here: every viewport
 * reaching this fn already satisfies `0 <= start <= end <= len`
 * (`clampViewport` et al. enforce it upstream), so `start/len` and `end/len`
 * already land in [0, 1] without re-guarding.
 */
export function navigatorWindowScene(
  viewport: ChartViewport,
  seriesLen: number,
): NavigatorWindowScene {
  if (seriesLen === 0) {
    return { left: 0, w: 100 };
  }

  const leftPct = (viewport.start / seriesLen) * 100;
  const rightPct = (viewport.end / seriesLen) * 100;
  return { left: leftPct, w: rightPct - leftPct };
}

export function volumeScene(
  series: readonly ChartCandle[],
  viewport?: ChartViewport,
): readonly VolumeSceneBar[] {
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
    return { key: i, up, x, w: cw * BODY_FRAC, h };
  });
}
