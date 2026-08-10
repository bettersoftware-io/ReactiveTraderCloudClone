import { type ReactElement, useEffect, useRef } from "react";

import type {
  EqChartType,
  EqDrawing,
  EqDrawTool,
  EqIndicatorId,
  EqPaneId,
  EqYScale,
} from "@rtc/client-core";
import type { Candle, ChartSubstrate } from "@rtc/domain";
import {
  chartScene,
  chartVm,
  crosshairScene,
  crosshairVm,
  type DrawingGrip,
  dragDrawing,
  drawingScene,
  hitTestDrawings,
  hitTestGrip,
  indicatorPoints,
  indicatorValues,
  navigatorLinePoints,
  navigatorWindowStyle,
  type PlotCanvasScene,
  paneReadout,
  paneScene,
  pointerToAnchor,
  volumeScene,
  volumeVm,
} from "@rtc/motion-core";

import type { PaneVm } from "./ChartPlot";
import { ChartPlot } from "./ChartPlot";
import type { IndicatorPath } from "./SvgPathLayer";
import {
  type ChartGestures,
  type DrawDraft,
  type DrawGestureSlots,
  type PlotFrac,
  useChartGestures,
} from "./useChartGestures";
import { useNavigatorBrush } from "./useNavigatorBrush";

/**
 * The interactive price plot's data/gesture join: owns the gesture hook
 * (zoom/pan/crosshair — `useChartGestures`), the `@rtc/motion-core`
 * chartVm/volumeVm/crosshairVm/indicator projections, and hands the result to
 * `ChartPlot` — the presentational leaf that actually renders the DOM.
 * `ChartPanel` stays a data/join component one level up; this is the seam
 * between the two.
 */
export function CandleChart({
  candles,
  liveRate,
  flashOn,
  kind,
  indicators,
  panes,
  yScale = "linear",
  compare,
  substrate = "dom",
  compareBackfill,
  defaultVisible,
  loadingOlder,
  historyExhausted,
  onLoadOlder,
  drawTool = "cursor",
  drawings = EMPTY_DRAWINGS,
  selectedDrawingId = null,
  onCommitDrawing = NOOP_COMMIT_DRAWING,
  onSelectDrawing = NOOP_SELECT_DRAWING,
  onDeleteSelected = NOOP_DELETE_SELECTED,
  onShiftAnchors = NOOP_SHIFT_ANCHORS,
  onUpdateDrawing = NOOP_UPDATE_DRAWING,
}: CandleChartProps): ReactElement {
  // Concrete, effect-named handlers (not inline closures) so the gesture
  // slots below read as "what happens", matching the repo's handler-naming
  // doctrine — `commitTrendline`/`commitLevel`/`selectHitDrawing` close over
  // `viewport`/`vm`/`drawItems`/`candles`, all declared further down in this
  // same render; that's a plain forward reference (these are hoisted
  // function declarations, only ever CALLED later, from a real gesture), not
  // a temporal-dead-zone hazard.
  const drawSlots: DrawGestureSlots = {
    tool: drawTool,
    onCommitLine: commitTrendline,
    onCommitLevel: commitLevel,
    onPlotClick: selectHitDrawing,
    hitGrip: gripAt,
    onCommitEdit: commitEditedDrawing,
    onDeleteKey: onDeleteSelected,
  };

  // Destructured (not kept as one `g.foo` object) so each field's own type
  // drives the plugin's ref-safety analysis individually — `useChartGestures`
  // returns `plotRef` (a real ref) alongside plain values, and reading them
  // back out via member access on the whole object trips react-hooks/refs'
  // "could be a ref" heuristic for every property, not just the ref one.
  const {
    viewport,
    cursor,
    atLiveEdge,
    plotProps,
    plotRef,
    resetToLive,
    applyViewport,
    paneHoverProps,
    draft,
    editDrag,
  } = useChartGestures(
    candles.length,
    defaultVisible,
    candles[0]?.time,
    drawSlots,
  );

  // The near-edge fetch trigger — deliberately an EFFECT, the only one in
  // the chart shells: syncing view state (the viewport nearing the loaded
  // series' left edge) to an external data request is exactly what effects
  // are for (ADR-005), unlike the brush shells' gesture translation which
  // stays effect-free. One window of margin: fetch before the user can hit
  // the wall at normal pan speed, never fetch on an idle chart. With a
  // comparison active the ONE trigger pages BOTH series: the gate fires
  // while ANY participating series can still grow (either-series gate —
  // if the primary exhausts first, the compare keeps paging), and the
  // handler side fires both loads, relying on CandleSeriesPresenter's
  // per-(symbol|timeframe) single-flight/exhaustion/cooldown to no-op the
  // ineligible one.
  const span = viewport.end - viewport.start;
  const nearLeftEdge = viewport.start < span;
  const primaryEligible = !loadingOlder && !historyExhausted;
  const compareEligible =
    compare !== undefined &&
    compareBackfill !== undefined &&
    !compareBackfill.loadingOlder &&
    !compareBackfill.historyExhausted;

  useEffect(() => {
    if (nearLeftEdge && (primaryEligible || compareEligible)) {
      onLoadOlder();
    }
  }, [nearLeftEdge, primaryEligible, compareEligible, onLoadOlder]);

  // Backfill prepend detection — same "an effect, not render-time" call as
  // the near-edge fetch trigger above: every trendline anchor is a candle
  // INDEX, so a prepend (the series growing while its first candle got
  // OLDER) shifts every existing index by the prepended count, or every
  // drawing silently drifts onto the wrong candles as older history loads
  // in underneath it.
  const firstTime = candles[0]?.time;
  const prevRef = useRef<PrependWatermark>({
    len: candles.length,
    firstTime,
  });

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { len: candles.length, firstTime };
    const grewBy = candles.length - prev.len;

    if (
      grewBy > 0 &&
      prev.firstTime !== undefined &&
      firstTime !== undefined &&
      firstTime < prev.firstTime
    ) {
      onShiftAnchors(grewBy);
    }
  }, [candles.length, firstTime, onShiftAnchors]);

  const historyStart = historyExhausted && viewport.start === 0;

  const vm = chartVm(candles, liveRate, flashOn, {
    viewport,
    kind,
    yScale,
    compare,
  });

  const cross = cursor
    ? crosshairVm(cursor.xFrac, cursor.yFrac, candles, viewport, vm.scale)
    : null;

  // Hoisted once — both the indicator overlays and the RSI/MACD panes derive
  // from the same close series.
  const closes = candles.map((c) => {
    return c.close;
  });

  const indicatorPaths = toIndicatorPaths(
    closes,
    indicators,
    viewport,
    vm.scale,
  );
  const paneVms = toPaneVms(panes, closes, viewport, cross);
  // The in-progress trendline draft, appended as a sentinel-id "draft"
  // drawing so committed and preview rendering share one `drawingScene`
  // call — `DrawingsLayer` styles the `id === "draft"` item via
  // `data-draft="true"` (dashed, no handles), no special-casing here.
  // Snapping the draft's `a`/`b` through `pointerToAnchor` (the same
  // projection `commitTrendline` below uses to commit) means the preview
  // already sits exactly where the commit will land — no free-floating
  // preview that jumps to a candle center on release.
  // A drag-edit in flight previews by replacing the dragged drawing with
  // its dragDrawing projection — the SAME call the commit makes, so the
  // preview is byte-identical to what pointer-up will commit.
  const previewDrawings = editDrag
    ? drawings.map((d) => {
        return d.id === editDrag.grip.id
          ? dragDrawing(
              d,
              editDrag.grip,
              editDrag.from,
              editDrag.to,
              viewport,
              vm.scale,
              candles.length,
            )
          : d;
      })
    : drawings;

  const allDrawings = draft
    ? [...previewDrawings, draftToDrawing(draft)]
    : previewDrawings;

  // EqDrawing (client-core) satisfies motion-core's structural `Drawing` —
  // passed directly, no mapping.
  const drawItems = drawingScene(
    allDrawings,
    viewport,
    vm.scale,
    selectedDrawingId,
  );

  // Concrete, effect-named handlers for the draw-gesture slots above and the
  // draft's live preview — declared as hoisted `function`s (not `const`
  // arrows) so `drawSlots` above can reference them by name before this
  // point in the render, while their bodies close over `viewport`/`vm`/
  // `drawItems`/`candles` from right here.
  function commitTrendline(a: PlotFrac, b: PlotFrac): void {
    const seriesLen = candles.length;
    onCommitDrawing({
      id: crypto.randomUUID(),
      kind: "trendline",
      a: pointerToAnchor(a.xFrac, a.yFrac, viewport, vm.scale, seriesLen),
      b: pointerToAnchor(b.xFrac, b.yFrac, viewport, vm.scale, seriesLen),
    });
  }

  function commitLevel(p: PlotFrac): void {
    const anchor = pointerToAnchor(
      p.xFrac,
      p.yFrac,
      viewport,
      vm.scale,
      candles.length,
    );
    onCommitDrawing({
      id: crypto.randomUUID(),
      kind: "hline",
      price: anchor.price,
    });
  }

  function selectHitDrawing(p: PlotFrac): void {
    onSelectDrawing(hitTestDrawings(drawItems, p.xFrac * 100, p.yFrac * 100));
  }

  function gripAt(p: PlotFrac): DrawingGrip | null {
    return hitTestGrip(drawItems, p.xFrac * 100, p.yFrac * 100);
  }

  function commitEditedDrawing(
    grip: DrawingGrip,
    from: PlotFrac,
    to: PlotFrac,
  ): void {
    const target = drawings.find((d) => {
      return d.id === grip.id;
    });

    if (!target) {
      return;
    }

    onUpdateDrawing(
      dragDrawing(target, grip, from, to, viewport, vm.scale, candles.length),
    );
  }

  function draftToDrawing(d: DrawDraft): EqDrawing {
    const seriesLen = candles.length;
    return {
      id: "draft",
      kind: "trendline",
      a: pointerToAnchor(d.a.xFrac, d.a.yFrac, viewport, vm.scale, seriesLen),
      b: pointerToAnchor(d.b.xFrac, d.b.yFrac, viewport, vm.scale, seriesLen),
    };
  }

  const brush = useNavigatorBrush(
    viewport,
    applyViewport,
    candles.length,
    candles[0]?.time,
  );

  // The two navigator halves change at very different rates, so they're
  // called separately (not via the composed `navigatorVm`): the Compiler
  // memoizes `navigatorLinePoints(candles)` on the series alone, so a
  // continuous brush drag (viewport changing per pointer move) never re-maps
  // the full 300-candle history per frame — only the cheap window style
  // recomputes.
  const nav = {
    linePoints: navigatorLinePoints(candles),
    windowStyle: navigatorWindowStyle(viewport, candles.length),
  };

  // Canvas-substrate scenes — assembled from the SAME motion-core calls the
  // DOM path already uses (chartVm/crosshairVm above are the DOM twins),
  // computed only in canvas mode so the DOM path pays nothing for it.
  const scene =
    substrate === "canvas"
      ? chartScene(candles, liveRate, flashOn, {
          viewport,
          kind,
          yScale,
          compare,
        })
      : null;

  const canvasPlot: PlotCanvasScene | null = scene
    ? {
        scene,
        overlays: indicators.map((id) => {
          return {
            id,
            points: indicatorPoints(
              indicatorValues(closes, id),
              viewport,
              vm.scale,
            ),
          };
        }),
        drawings: drawItems,
        crosshair: cursor
          ? crosshairScene(
              cursor.xFrac,
              cursor.yFrac,
              candles,
              viewport,
              vm.scale,
            )
          : null,
      }
    : null;

  return (
    <ChartPlot
      vm={vm}
      kind={kind}
      indicatorPaths={indicatorPaths}
      drawItems={drawItems}
      cross={cross}
      atLiveEdge={atLiveEdge}
      volumeBars={volumeVm(candles, viewport)}
      onBackToLive={resetToLive}
      plotProps={plotProps}
      plotRef={plotRef}
      nav={nav}
      navProps={brush.stripProps}
      loadingOlder={loadingOlder}
      historyStart={historyStart}
      panes={paneVms}
      paneCrosshairStyle={cross?.style ?? null}
      showHorizontal={cursor?.inPlot ?? false}
      paneHoverProps={paneHoverProps}
      substrate={substrate}
      canvasPlot={canvasPlot ?? undefined}
      canvasVolume={
        substrate === "canvas" ? volumeScene(candles, viewport) : undefined
      }
    />
  );
}

/** The candle series' length + first-candle time as of the last render — the
 * prepend-detection effect's own watermark, compared against the current
 * render's values to tell a backfill prepend from a live append. */
interface PrependWatermark {
  readonly len: number;
  readonly firstTime: number | undefined;
}

export interface CandleChartProps {
  candles: readonly Candle[];
  liveRate: number;
  flashOn: boolean;
  kind: EqChartType;
  indicators: readonly EqIndicatorId[];
  /** The active RSI/MACD panes, in render order (empty renders none). */
  panes: readonly EqPaneId[];
  /** Price-axis mapping; optional so existing spec mounts keep compiling —
   * absent means "linear" (the bare default stays bare). */
  yScale?: EqYScale;
  /** Comparison series overlay — presence switches the whole plot to the
   * percent axis (see @rtc/motion-core chartScene). An empty `series` while
   * the compare symbol's data is still loading percent-projects the primary
   * alone (the axis is already %, so the line's arrival doesn't reflow). */
  compare?: { readonly series: readonly Candle[] };
  /** The rendering substrate for the plot/volume/pane geometry layers.
   * Defaults to `"dom"` (the existing SVG/div geometry, byte-identical to
   * before this prop existed); `"canvas"` swaps those three geometry
   * layers for per-region `SceneCanvas` hosts — text (price labels, time
   * axis, crosshair readout, chips, BackToLive) always stays DOM. */
  substrate?: ChartSubstrate;
  /** The comparison symbol's backfill flags — powers the near-edge
   * trigger's either-series gate below. Silent paging: these flags never
   * drive the chips, which stay the primary's. Declared structurally (the
   * bindings' CandleBackfillState satisfies it) so ui-contract's props
   * mirror never needs a bindings import. Omitted ⇒ the compare series
   * never gates the trigger — exactly the pre-parity behaviour. */
  compareBackfill?: {
    readonly loadingOlder: boolean;
    readonly historyExhausted: boolean;
  };
  /** The timeframe's default visible-candle count (`CANDLE_DEFAULT_VISIBLE`)
   * — seeds `useChartGestures`' initial/reset viewport. ChartPanel already
   * computes this from the selected timeframe. */
  defaultVisible: number;
  /** Whether an older history page is currently in flight for this series —
   * drives the LOADING OLDER… chip and gates re-triggering. */
  loadingOlder: boolean;
  /** Whether the series has reached the true start of history — combined
   * with the viewport sitting at index 0 to derive the START OF HISTORY
   * chip. */
  historyExhausted: boolean;
  /** Fetches one older history page — the near-edge trigger's intent.
   * Slot: the caller decides what "load older" means for this series. */
  onLoadOlder: () => void;
  /** The active draw tool — defaults to `"cursor"` (no drawing gesture
   * active). Drives `useChartGestures`' pointer-down fork (hline commits
   * immediately, trendline opens a draft, cursor clicks hit-test). */
  drawTool?: EqDrawTool;
  /** The current symbol's committed drawings, in plot order — defaults to
   * none. Re-projected into plot-percent geometry every render via
   * `drawingScene`, alongside any in-progress draft. */
  drawings?: readonly EqDrawing[];
  /** The id of the currently-selected drawing, or `null` — drives which
   * item's handles `drawingScene` projects. */
  selectedDrawingId?: string | null;
  /** Commits a finished drawing gesture (trendline drag past the click
   * threshold, or an hline pointer-down). Slot: default no-op keeps this
   * component mountable without a drawings machine wired up. */
  onCommitDrawing?: (drawing: EqDrawing) => void;
  /** Selects (or clears, on `null`) a drawing by id. Slot: default no-op. */
  onSelectDrawing?: (id: string | null) => void;
  /** Deletes the currently-selected drawing. Slot: default no-op. */
  onDeleteSelected?: () => void;
  /** Shifts every trendline anchor index by `by` (a live prepend keeping
   * drawings pinned to their candles). Slot: default no-op. */
  onShiftAnchors?: (by: number) => void;
  /** Replaces a drawing after a finished drag-edit (the same id, new
   * anchors). Slot: default no-op. */
  onUpdateDrawing?: (drawing: EqDrawing) => void;
}

/** Stable empty-array identity for the `drawings` default — avoids a fresh
 * `[]` (and so a `drawingScene` re-run) on every render when the caller
 * omits the prop. */
const EMPTY_DRAWINGS: readonly EqDrawing[] = [];

/** Stable no-op identities for the drawing slots' defaults — keeps this
 * component mountable without a drawings machine wired up (e.g. a spec mount
 * that only cares about candles/indicators). */
function NOOP_COMMIT_DRAWING(_drawing: EqDrawing): void {}

function NOOP_SELECT_DRAWING(_id: string | null): void {}

function NOOP_DELETE_SELECTED(): void {}

function NOOP_SHIFT_ANCHORS(_by: number): void {}

function NOOP_UPDATE_DRAWING(_drawing: EqDrawing): void {}

/** Projects each active indicator's value series into the visible viewport,
 * pre-joined into the SVG `points` string SvgPathLayer renders verbatim
 * (vm owns numbers, shell owns markup strings). */
function toIndicatorPaths(
  closes: readonly number[],
  indicators: readonly EqIndicatorId[],
  viewport: ChartGestures["viewport"],
  scale: Parameters<typeof indicatorPoints>[2],
): readonly IndicatorPath[] {
  return indicators.map((id) => {
    const values = indicatorValues(closes, id);
    const points = indicatorPoints(values, viewport, scale);
    const pointsAttr = points
      .map((p) => {
        return `${p.x},${p.y}`;
      })
      .join(" ");
    return { id, pointsAttr };
  });
}

/** Projects each active pane's geometry + live readout — the readout is
 * `null` until a crosshair is present (no candle hovered yet to read out). */
function toPaneVms(
  panes: readonly EqPaneId[],
  closes: readonly number[],
  viewport: ChartGestures["viewport"],
  cross: ReturnType<typeof crosshairVm>,
): readonly PaneVm[] {
  return panes.map((kind) => {
    return {
      kind,
      scene: paneScene(kind, closes, viewport),
      readout: cross ? paneReadout(kind, closes, cross.idx) : null,
    };
  });
}
