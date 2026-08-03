import type { ChartViewport } from "./chartViewport.js";
import type { ChartPoint } from "./chartVm.js";
import { macdValues, rsiValues } from "./paneSeries.js";

/** The two indicator panes rendered below the price chart. */
export type EqPaneKind = "rsi" | "macd";

/** One plotted line within a pane (RSI's single line, or MACD's macd/signal
 * pair) — the pane-scene twin of `SceneCandle`'s line-mode `linePoints`. */
export interface PaneLine {
  readonly key: string;
  readonly points: readonly ChartPoint[];
}

/** One MACD histogram bar's geometry, keyed by close index. Bars render
 * from the zero line: the shell derives the rect top as `up ? y(hist) :
 * y(0)`, using `h`/`up` from here — this scene carries geometry only. */
export interface PaneBar {
  readonly key: number;
  readonly x: number;
  readonly w: number;
  readonly h: number;
  readonly up: boolean;
}

/** A horizontal reference line (RSI's 70/30 bands, MACD's zero line). */
export interface PaneGuide {
  readonly key: number;
  readonly y: number;
}

export interface PaneScene {
  readonly kind: EqPaneKind;
  readonly lines: readonly PaneLine[];
  readonly histogram: readonly PaneBar[];
  readonly guides: readonly PaneGuide[];
}

/** One row of a pane's live readout (RSI's single row, or MACD's
 * MACD/SIG/HIST triple); `txt` is already formatted, `"—"` through warm-up. */
export interface PaneReadoutRow {
  readonly label: string;
  readonly txt: string;
}

/** Shared pane Y-mapping constants: both panes map their value range into
 * [PANE_Y_TOP%, (PANE_Y_TOP+PANE_Y_SPAN)%] of the pane box, inverted (the
 * higher value at the top) — the pane-box analogue of chartVm's Y_TOP/Y_SPAN. */
export const PANE_Y_TOP = 8;
export const PANE_Y_SPAN = 84;

/** RSI's fixed scale upper bound; RSI never rescales to the visible slice. */
const RSI_MAX = 100;
/** RSI's overbought/oversold reference bands. */
const RSI_UPPER_GUIDE = 70;
const RSI_LOWER_GUIDE = 30;
/** Histogram bar width as a fraction of a column — chartScene.ts's private
 * BODY_FRAC convention, mirrored here since motion-core keeps its geometry
 * constants file-local rather than sharing them across scene modules. */
const BODY_FRAC = 0.64;
/** Fallback MACD scale when the visible slice has no non-zero defined
 * macd/signal/hist value (an all-null warm-up window, or dead-flat closes). */
const MACD_SCALE_FALLBACK = 1;
/** Literal em-dash glyph for a warm-up readout — never a `\u` escape. */
const EM_DASH = "—";

interface PaneWindow {
  readonly iFirst: number;
  readonly iLast: number;
  readonly span: number;
}

// Resolves the visible index range + raw (unclamped) span, mirroring
// chartScene.ts's private resolveWindow (there keyed off a candle series
// length; here off the closes array itself).
function resolvePaneWindow(
  viewport: ChartViewport,
  seriesLen: number,
): PaneWindow {
  const iFirst = Math.max(0, Math.floor(viewport.start));
  const iLast = Math.min(seriesLen - 1, Math.ceil(viewport.end) - 1);
  const span = viewport.end - viewport.start || 1;
  return { iFirst, iLast, span };
}

// Mirrors chartScene.ts's private (non-exported) `xPct` twin: column-center
// percent position of index `i` within the viewport.
function xPct(i: number, vp: ChartViewport, span: number): number {
  return ((i + 0.5 - vp.start) / span) * 100;
}

// Builds one PaneLine from a value series, skipping warm-up nulls — the same
// convention indicatorSeries.ts's indicatorPoints uses for overlay lines.
function paneLine(
  key: string,
  values: readonly (number | null)[],
  vp: ChartViewport,
  win: PaneWindow,
  yOf: (v: number) => number,
): PaneLine {
  const points: ChartPoint[] = [];

  for (let i = win.iFirst; i <= win.iLast; i++) {
    const v = values[i];

    if (v === null || v === undefined) {
      continue;
    }

    points.push({ x: xPct(i, vp, win.span), y: yOf(v) });
  }

  return { key, points };
}

// RSI is fixed-scale (0-100), never rescaled to the visible slice: v maps
// linearly, inverted, into [PANE_Y_TOP, PANE_Y_TOP + PANE_Y_SPAN].
function yRsi(v: number): number {
  return ((RSI_MAX - v) / RSI_MAX) * PANE_Y_SPAN + PANE_Y_TOP;
}

function rsiPaneScene(
  closes: readonly number[],
  viewport: ChartViewport,
): PaneScene {
  const win = resolvePaneWindow(viewport, closes.length);
  const values = rsiValues(closes);
  const line = paneLine("rsi", values, viewport, win, yRsi);

  return {
    kind: "rsi",
    lines: [line],
    histogram: [],
    guides: [
      { key: 0, y: yRsi(RSI_UPPER_GUIDE) },
      { key: 1, y: yRsi(RSI_LOWER_GUIDE) },
    ],
  };
}

// MACD's symmetric scale: the largest magnitude across macd/signal/hist over
// the VISIBLE slice's defined values, falling back to MACD_SCALE_FALLBACK
// when that comes out to 0 (an all-null window, or dead-flat closes where
// every defined value is exactly 0 — constant closes hits this branch too).
function macdScale(
  macd: readonly (number | null)[],
  signal: readonly (number | null)[],
  hist: readonly (number | null)[],
  win: PaneWindow,
): number {
  let m = 0;

  for (let i = win.iFirst; i <= win.iLast; i++) {
    m = Math.max(
      m,
      Math.abs(macd[i] ?? 0),
      Math.abs(signal[i] ?? 0),
      Math.abs(hist[i] ?? 0),
    );
  }

  return m || MACD_SCALE_FALLBACK;
}

function macdPaneScene(
  closes: readonly number[],
  viewport: ChartViewport,
): PaneScene {
  const win = resolvePaneWindow(viewport, closes.length);
  const { macd, signal, hist } = macdValues(closes);
  const m = macdScale(macd, signal, hist, win);

  function yOf(v: number): number {
    return ((m - v) / (2 * m)) * PANE_Y_SPAN + PANE_Y_TOP;
  }

  const yZero = yOf(0);
  const w = (100 / win.span) * BODY_FRAC;
  const histogram: PaneBar[] = [];

  for (let i = win.iFirst; i <= win.iLast; i++) {
    const h = hist[i];

    if (h === null || h === undefined) {
      continue;
    }

    histogram.push({
      key: i,
      x: xPct(i, viewport, win.span),
      w,
      h: Math.abs(yOf(h) - yZero),
      up: h >= 0,
    });
  }

  return {
    kind: "macd",
    lines: [
      paneLine("macd", macd, viewport, win, yOf),
      paneLine("signal", signal, viewport, win, yOf),
    ],
    histogram,
    guides: [{ key: 0, y: yZero }],
  };
}

/** Builds an indicator pane's plotted geometry (lines, histogram, guides)
 * from a close series and the shared price-chart viewport — RSI's fixed 0-100
 * scale, or MACD's scale computed from the visible slice. See PANE_Y_TOP/
 * PANE_Y_SPAN and each pane's own scaling rule above. */
export function paneScene(
  kind: EqPaneKind,
  closes: readonly number[],
  viewport: ChartViewport,
): PaneScene {
  return kind === "rsi"
    ? rsiPaneScene(closes, viewport)
    : macdPaneScene(closes, viewport);
}

function formatReadoutValue(
  v: number | null | undefined,
  decimals: number,
): string {
  return v === null || v === undefined ? EM_DASH : v.toFixed(decimals);
}

const RSI_DECIMALS = 1;
const MACD_DECIMALS = 2;

function rsiReadout(
  closes: readonly number[],
  idx: number,
): readonly PaneReadoutRow[] {
  const v = rsiValues(closes)[idx];
  return [{ label: "RSI", txt: formatReadoutValue(v, RSI_DECIMALS) }];
}

function macdReadout(
  closes: readonly number[],
  idx: number,
): readonly PaneReadoutRow[] {
  const { macd, signal, hist } = macdValues(closes);
  return [
    { label: "MACD", txt: formatReadoutValue(macd[idx], MACD_DECIMALS) },
    { label: "SIG", txt: formatReadoutValue(signal[idx], MACD_DECIMALS) },
    { label: "HIST", txt: formatReadoutValue(hist[idx], MACD_DECIMALS) },
  ];
}

/** Formats a pane's live readout at one close index: RSI's single row (1
 * decimal), or MACD's MACD/SIG/HIST triple (2 decimals) — `"—"` (the literal
 * em-dash glyph) wherever the underlying series is still in warm-up. */
export function paneReadout(
  kind: EqPaneKind,
  closes: readonly number[],
  idx: number,
): readonly PaneReadoutRow[] {
  return kind === "rsi" ? rsiReadout(closes, idx) : macdReadout(closes, idx);
}
