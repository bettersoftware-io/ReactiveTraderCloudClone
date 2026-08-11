import type {
  ChartScene,
  CrosshairScene,
  SceneCandle,
  VolumeSceneBar,
} from "./chartScene.js";
import type { ChartPoint } from "./chartVm.js";
import type { DrawingSceneItem } from "./drawingScene.js";
import type { PaneBar, PaneScene } from "./paneScene.js";

/**
 * A drawn gradient stop list — the structural stand-in for
 * `CanvasGradient`. `Canvas2D.createLinearGradient` returns this rather
 * than the DOM type so motion-core never names `lib.dom`.
 */
export interface CanvasGradient2D {
  addColorStop(offset: number, color: string): void;
}

/**
 * The structural subset of `CanvasRenderingContext2D` the chart engine
 * draws through. Declared here (not imported from `lib.dom`) so
 * motion-core stays no-DOM: a structural type is not DOM access, and the
 * real 2D context satisfies it at every client call site. Text members are
 * deliberately absent — the substrate design keeps every glyph in the DOM
 * (labels, readouts, and the crosshair's OHLCV strip are all real elements
 * layered over the canvas, never `fillText`/`strokeText`).
 */
export interface Canvas2D {
  fillStyle: string | CanvasGradient2D;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  shadowBlur: number;
  shadowColor: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  stroke(): void;
  fill(): void;
  setLineDash(segments: readonly number[]): void;
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): CanvasGradient2D;
}

/**
 * Every geometry color the chart engine's three draw functions need — the
 * production successor to the renderer-seam spike's four-key
 * `ChartPalette` (bodyUp/bodyDown/wick/grid), grown to cover overlays,
 * drawings, the crosshair, and both indicator panes. A host supplies one
 * instance per active theme, sourced from the same CSS custom properties
 * its DOM chart already reads (see {@link CHART_PALETTE_TOKENS}) — the
 * canvas surface stays visually identical to the SVG/DOM one it replaces
 * without a second color system.
 */
export interface ChartPalette {
  readonly up: string;
  readonly down: string;
  readonly grid: string;
  readonly line: string;
  readonly sma20: string;
  readonly ema50: string;
  readonly compare: string;
  readonly drawing: string;
  readonly drawingLevel: string;
  readonly grip: string;
  readonly crosshair: string;
  readonly paneRsi: string;
  readonly paneMacd: string;
  readonly paneSignal: string;
  readonly paneGuide: string;
  readonly histogram: string;
}

/**
 * Maps every {@link ChartPalette} key to the CSS custom property a host
 * reads its value from at draw time — the single source of truth both web
 * clients' chart `*.module.css` files are checked against (see this
 * package's `drawChartScene.test.ts`, which reads both trees with
 * `node:fs` and asserts every token string still appears in each), so the
 * canvas engine's palette can never silently drift from the DOM chart's
 * own theme tokens.
 */
export const CHART_PALETTE_TOKENS: Record<keyof ChartPalette, `--${string}`> = {
  up: "--accent-positive",
  down: "--accent-negative",
  grid: "--grid",
  line: "--accent-primary",
  sma20: "--accent-2",
  ema50: "--accent-aware",
  compare: "--accent-compare",
  drawing: "--accent-primary",
  drawingLevel: "--accent-aware",
  grip: "--accent-primary",
  crosshair: "--border-strong",
  paneRsi: "--accent-primary",
  paneMacd: "--accent-2",
  paneSignal: "--accent-aware",
  paneGuide: "--grid",
  histogram: "--text-muted",
} as const satisfies Record<keyof ChartPalette, `--${string}`>;

/** Pixel dimensions of the canvas a draw function renders into. */
export interface CanvasSize {
  readonly w: number;
  readonly h: number;
}

/** One overlay indicator's already-projected line — the canvas-engine twin
 * of `SvgPathLayer`'s `IndicatorPath`, keyed by the same overlay id
 * (`"sma20"`/`"ema50"`) so {@link drawPlotScene} can pick its stroke color
 * without a second lookup table living at the call site. */
export interface OverlayLine {
  readonly id: string;
  readonly points: readonly ChartPoint[];
}

/** Everything {@link drawPlotScene} needs for one frame of the price plot:
 * the base candle/line/area scene, any active overlay lines, the projected
 * drawings (trendlines/hlines, with grip handles when selected), and the
 * crosshair (`null` when idle). */
export interface PlotCanvasScene {
  readonly scene: ChartScene;
  readonly overlays: readonly OverlayLine[];
  readonly drawings: readonly DrawingSceneItem[];
  readonly crosshair: CrosshairScene | null;
}

/** Radius, in pixels, of a drawing's selection-handle grip circle. */
const GRIP_RADIUS_PX = 4;
/** A full circle in radians — {@link Canvas2D.arc}'s end angle for a grip. */
const FULL_TURN: number = Math.PI * 2;
/** The area fill's opacity — a translucent wash under the close line,
 * matching `SvgPathLayer`'s CSS-gradient fill (never fully opaque, so the
 * grid/candles beneath stay legible). */
const AREA_FILL_ALPHA = 0.35;
/** `setLineDash` pattern for an in-progress ("draft") drawing. */
const DRAFT_DASH: readonly number[] = [4, 4];

/* Per-layer stroke widths, mirroring the DOM chart's stylesheet
 * `stroke-width` values (SvgPathLayer/DrawingsLayer/IndicatorPane
 * `.module.css`) so the two substrates weight their lines identically.
 * Every stroking layer sets its own width explicitly — before these
 * existed, overlays/compare/drawings inherited whatever width the
 * previous layer left behind, so their weight varied by scene kind. */
const CLOSE_LINE_WIDTH = 1.5;
const OVERLAY_LINE_WIDTH = 1;
const COMPARE_LINE_WIDTH = 1.5;
const DRAWING_LINE_WIDTH = 1.5;
const DRAWING_SELECTED_LINE_WIDTH = 2;
const PANE_LINE_WIDTH = 1.25;
/** `setLineDash` pattern that restores a solid stroke. */
const SOLID_DASH: readonly number[] = [];

/** Scales a scene percent (0-100 of the plot box) into a pixel coordinate
 * for the given axis span. The one place every draw function converts
 * scene-space into canvas-space. */
function px(pct: number, span: number): number {
  return (pct / 100) * span;
}

/** Strokes one open polyline through `points` (percent coordinates,
 * projected via {@link px}) using the `strokeStyle`/`lineWidth` the
 * caller set — every stroking layer sets both explicitly (see the
 * per-layer width constants above). A single point or an empty array
 * draws nothing — there is no line to trace. */
function strokePolyline(
  ctx: Canvas2D,
  points: readonly ChartPoint[],
  size: CanvasSize,
): void {
  const first = points[0];

  if (!first) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(px(first.x, size.w), px(first.y, size.h));

  for (let i = 1; i < points.length; i++) {
    const p = points[i];

    if (!p) {
      continue;
    }

    ctx.lineTo(px(p.x, size.w), px(p.y, size.h));
  }

  ctx.stroke();
}

/** Grid lines only (skips entirely, including the strokeStyle/lineWidth
 * setup, when `scene.grid` is empty — an empty scene draws nothing beyond
 * its `clearRect`). */
function drawGrid(
  ctx: Canvas2D,
  scene: ChartScene,
  palette: ChartPalette,
  size: CanvasSize,
): void {
  if (scene.grid.length === 0) {
    return;
  }

  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;

  for (const line of scene.grid) {
    const y = px(line.top, size.h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size.w, y);
    ctx.stroke();
  }
}

/** Draws every candle: wick then body, both in the same up/down color (the
 * production palette has no separate wick color, unlike the retired
 * spike's). Wick geometry is verbatim from the spike engine — `x - 0.5`,
 * 1px wide; the body is centered on `x`. A glowing last candle (live-tick
 * flash) wraps its body fillRect only — not the wick — in a shadow, reset
 * immediately after. */
function drawCandles(
  ctx: Canvas2D,
  candles: readonly SceneCandle[],
  palette: ChartPalette,
  size: CanvasSize,
): void {
  for (const cd of candles) {
    const color = cd.up ? palette.up : palette.down;
    ctx.fillStyle = color;
    ctx.fillRect(
      px(cd.wickX, size.w) - 0.5,
      px(cd.wickTop, size.h),
      1,
      px(cd.wickH, size.h),
    );

    if (cd.glow) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
    }

    const w = px(cd.w, size.w);
    ctx.fillRect(
      px(cd.x, size.w) - w / 2,
      px(cd.top, size.h),
      w,
      px(cd.h, size.h),
    );

    if (cd.glow) {
      ctx.shadowBlur = 0;
    }
  }
}

/** Fills the area under a line/area-kind scene's close line: the polyline
 * path extended down to the bottom edge at its last and first x, closed,
 * and filled with a top-to-bottom gradient (`palette.line` → transparent)
 * at {@link AREA_FILL_ALPHA}, alpha restored to 1 immediately after so it
 * never leaks into a later pass. Draws nothing for fewer than one point. */
function fillAreaUnderLine(
  ctx: Canvas2D,
  points: readonly ChartPoint[],
  palette: ChartPalette,
  size: CanvasSize,
): void {
  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(px(first.x, size.w), px(first.y, size.h));

  for (let i = 1; i < points.length; i++) {
    const p = points[i];

    if (!p) {
      continue;
    }

    ctx.lineTo(px(p.x, size.w), px(p.y, size.h));
  }

  ctx.lineTo(px(last.x, size.w), size.h);
  ctx.lineTo(px(first.x, size.w), size.h);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, 0, 0, size.h);
  gradient.addColorStop(0, palette.line);
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.globalAlpha = AREA_FILL_ALPHA;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** id-keyed overlay stroke color: `"sma20"`/`"ema50"` get their dedicated
 * palette entries, any other id falls back to `palette.line` (mirrors
 * `SvgPathLayer.module.css`'s `.indicator` default for an overlay kind the
 * palette hasn't been taught yet). */
function overlayColor(id: string, palette: ChartPalette): string {
  if (id === "sma20") {
    return palette.sma20;
  }

  if (id === "ema50") {
    return palette.ema50;
  }

  return palette.line;
}

/** id-keyed pane-line stroke color: `"rsi"`/`"macd"`/`"signal"` get their
 * dedicated palette entries; any other key falls back to `palette.line`
 * (unreachable via {@link PaneScene} today, kept for the same total-lookup
 * reason as {@link overlayColor}). */
function paneLineColor(key: string, palette: ChartPalette): string {
  if (key === "rsi") {
    return palette.paneRsi;
  }

  if (key === "macd") {
    return palette.paneMacd;
  }

  if (key === "signal") {
    return palette.paneSignal;
  }

  return palette.line;
}

/** Draws every projected drawing: a trendline's segment or an hline's
 * full-width line, then — only when selected (non-empty `handles`) — a
 * filled grip circle per handle. The item id `"draft"` (an in-progress
 * drawing, never a committed one — no other id is ever spelled that way)
 * dashes its own stroke for the duration of that one item, restored to
 * solid immediately after, exactly like {@link fillAreaUnderLine}'s alpha
 * reset. */
function drawDrawings(
  ctx: Canvas2D,
  drawings: readonly DrawingSceneItem[],
  palette: ChartPalette,
  size: CanvasSize,
): void {
  for (const item of drawings) {
    const isDraft = item.id === "draft";

    if (isDraft) {
      ctx.setLineDash(DRAFT_DASH);
    }

    ctx.lineWidth = item.selected
      ? DRAWING_SELECTED_LINE_WIDTH
      : DRAWING_LINE_WIDTH;
    ctx.beginPath();

    if (item.kind === "trendline") {
      ctx.strokeStyle = palette.drawing;
      ctx.moveTo(px(item.x1, size.w), px(item.y1, size.h));
      ctx.lineTo(px(item.x2, size.w), px(item.y2, size.h));
    } else {
      ctx.strokeStyle = palette.drawingLevel;
      const y = px(item.y, size.h);
      ctx.moveTo(0, y);
      ctx.lineTo(size.w, y);
    }

    ctx.stroke();

    if (isDraft) {
      ctx.setLineDash(SOLID_DASH);
    }

    if (item.handles.length === 0) {
      continue;
    }

    ctx.fillStyle = palette.grip;

    for (const h of item.handles) {
      ctx.beginPath();
      ctx.arc(px(h.x, size.w), px(h.y, size.h), GRIP_RADIUS_PX, 0, FULL_TURN);
      ctx.fill();
    }
  }
}

/** Draws the crosshair's vertical + horizontal 1px echo lines through its
 * snapped plot position. */
function drawCrosshair(
  ctx: Canvas2D,
  crosshair: CrosshairScene,
  palette: ChartPalette,
  size: CanvasSize,
): void {
  ctx.strokeStyle = palette.crosshair;
  ctx.lineWidth = 1;

  const cx = px(crosshair.x, size.w);
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, size.h);
  ctx.stroke();

  const cy = px(crosshair.y, size.h);
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(size.w, cy);
  ctx.stroke();
}

/**
 * Draws one frame of the price plot onto `ctx`: clear, grid, the base
 * scene's candles/line/area, any overlay lines, the compare line, every
 * drawing (with grips), then the crosshair — the production successor to
 * the retired renderer-seam spike's `drawChartScene`, ported onto the
 * structural {@link Canvas2D} and grown to the plot's full visual surface.
 * Geometry only: no text is ever drawn (see {@link Canvas2D}'s doc) — a
 * chart host overlays its own DOM labels/readouts.
 *
 * Draw order: clear → grid → (candles | line | area) → overlays → compare
 * → drawings+grips → crosshair. An area scene fills before it strokes its
 * own close line, so the line renders on top of its fill — the same
 * back-to-front order `SvgPathLayer`'s area `<path>` (before its
 * `<polyline>`) already gives the DOM chart.
 */
export function drawPlotScene(
  ctx: Canvas2D,
  plot: PlotCanvasScene,
  palette: ChartPalette,
  size: CanvasSize,
): void {
  const { scene, overlays, drawings, crosshair } = plot;

  ctx.clearRect(0, 0, size.w, size.h);
  drawGrid(ctx, scene, palette, size);

  if (scene.kind === "candles") {
    drawCandles(ctx, scene.candles, palette, size);
  } else {
    if (scene.kind === "area") {
      fillAreaUnderLine(ctx, scene.linePoints, palette, size);
    }

    ctx.strokeStyle = palette.line;
    ctx.lineWidth = CLOSE_LINE_WIDTH;
    strokePolyline(ctx, scene.linePoints, size);
  }

  if (overlays.length > 0) {
    ctx.lineWidth = OVERLAY_LINE_WIDTH;
  }

  for (const overlay of overlays) {
    ctx.strokeStyle = overlayColor(overlay.id, palette);
    strokePolyline(ctx, overlay.points, size);
  }

  if (scene.compareLinePoints.length > 0) {
    ctx.strokeStyle = palette.compare;
    ctx.lineWidth = COMPARE_LINE_WIDTH;
    strokePolyline(ctx, scene.compareLinePoints, size);
  }

  drawDrawings(ctx, drawings, palette, size);

  if (crosshair) {
    drawCrosshair(ctx, crosshair, palette, size);
  }
}

/**
 * Draws one frame of the volume pane: a clear, then one fillRect per bar
 * rising from the bottom edge (`y = size.h - h`), colored by `bar.up`.
 */
export function drawVolumeScene(
  ctx: Canvas2D,
  bars: readonly VolumeSceneBar[],
  palette: ChartPalette,
  size: CanvasSize,
): void {
  ctx.clearRect(0, 0, size.w, size.h);

  for (const bar of bars) {
    ctx.fillStyle = bar.up ? palette.up : palette.down;
    const w = px(bar.w, size.w);
    const h = px(bar.h, size.h);
    ctx.fillRect(px(bar.x, size.w) - w / 2, size.h - h, w, h);
  }
}

/** A histogram bar's pixel rect top, matching `IndicatorPane.tsx`'s
 * `toHistogramPath` derivation verbatim: the top sits at the zero guide's
 * (pixel) y when the bar points down, or `hPx` above it (i.e. at the bar's
 * own projected value) when it points up. `hPx` is the bar's height
 * already scaled to pixels — `bar.h` itself is still a plot-percent value,
 * not comparable to the pixel `zeroY` directly. */
function histogramRectTop(bar: PaneBar, hPx: number, zeroY: number): number {
  return bar.up ? zeroY - hPx : zeroY;
}

/**
 * Draws one frame of an indicator pane: a clear, the reference guides
 * (`palette.paneGuide`), the MACD histogram (`palette.histogram`, empty for
 * RSI), then each plotted line colored by its key (`"rsi"` → `paneRsi`,
 * `"macd"` → `paneMacd`, `"signal"` → `paneSignal`). The zero/guide y used
 * by the histogram is `scene.guides[0]`'s y (falling back to the pane's
 * vertical midpoint when a pane ever has no guides), the same convention
 * `IndicatorPane.tsx` uses for its own `zeroGuideY`.
 */
export function drawPaneScene(
  ctx: Canvas2D,
  scene: PaneScene,
  palette: ChartPalette,
  size: CanvasSize,
): void {
  ctx.clearRect(0, 0, size.w, size.h);

  ctx.strokeStyle = palette.paneGuide;
  ctx.lineWidth = 1;

  for (const guide of scene.guides) {
    const y = px(guide.y, size.h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size.w, y);
    ctx.stroke();
  }

  const zeroY = px(scene.guides[0]?.y ?? 50, size.h);
  ctx.fillStyle = palette.histogram;

  for (const bar of scene.histogram) {
    const w = px(bar.w, size.w);
    const h = px(bar.h, size.h);
    ctx.fillRect(
      px(bar.x, size.w) - w / 2,
      histogramRectTop(bar, h, zeroY),
      w,
      h,
    );
  }

  if (scene.lines.length > 0) {
    ctx.lineWidth = PANE_LINE_WIDTH;
  }

  for (const line of scene.lines) {
    ctx.strokeStyle = paneLineColor(line.key, palette);
    strokePolyline(ctx, line.points, size);
  }
}
