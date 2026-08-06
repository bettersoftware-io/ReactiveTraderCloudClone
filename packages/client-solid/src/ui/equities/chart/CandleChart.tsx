import { createEffect, createMemo, type JSX } from "solid-js";

import type {
  EqChartType,
  EqDrawing,
  EqDrawTool,
  EqIndicatorId,
  EqPaneId,
  EqYScale,
} from "@rtc/client-core";
import type { Candle } from "@rtc/domain";
import {
  type ChartViewport,
  type ChartVm,
  chartVm,
  crosshairVm,
  type DrawingGrip,
  type DrawingSceneItem,
  dragDrawing,
  drawingScene,
  hitTestDrawings,
  hitTestGrip,
  indicatorPoints,
  indicatorValues,
  type NavigatorVm,
  navigatorLinePoints,
  navigatorWindowStyle,
  paneReadout,
  paneScene,
  pointerToAnchor,
  volumeVm,
} from "@rtc/motion-core";

import { ChartPlot, type PaneVm } from "./ChartPlot";
import {
  type ChartGestures,
  createChartGestures,
  type DrawDraft,
  type DrawGestureSlots,
  type PlotFrac,
} from "./createChartGestures";
import { createNavigatorBrush } from "./createNavigatorBrush";
import type { IndicatorPath } from "./SvgPathLayer";

/**
 * The interactive price plot's data/gesture join: owns the gesture primitive
 * (zoom/pan/crosshair/draw — `createChartGestures`), the `@rtc/motion-core`
 * chartVm/volumeVm/crosshairVm/indicator/drawingScene projections, and hands
 * the result to `ChartPlot` — the presentational leaf that actually renders
 * the DOM. `ChartPanel` stays a data/join component one level up; this is
 * the seam between the two.
 */
export function CandleChart(props: CandleChartProps): JSX.Element {
  // Concrete, effect-named handlers (not inline closures) so the gesture
  // slots below read as "what happens", matching the repo's handler-naming
  // doctrine — `commitTrendline`/`commitLevel`/`selectHitDrawing` close over
  // `g`/`vm`/`drawItems`/`props`, all declared further down in this same
  // setup function; that's a plain forward reference (these are hoisted
  // function declarations, only ever CALLED later, from a real gesture), not
  // a temporal-dead-zone hazard — Solid's setup runs once, so there is no
  // "next render" for any of this to go stale across.
  //
  // `tool` is an ACCESSOR (`() => props.drawTool ?? "cursor"`), not the
  // plain value React's slot object carries — `createChartGestures` is
  // called exactly once below (Solid has no per-render re-invocation to
  // hand it a fresh value each time), so a plain field captured at that one
  // call would freeze at whichever tool was active on mount and never see
  // a later switch. Reading `props.drawTool` inside the accessor keeps it
  // live, resolved fresh every time a gesture handler calls `draw.tool()`.
  const drawSlots: DrawGestureSlots = {
    tool: () => {
      return props.drawTool ?? "cursor";
    },
    onCommitLine: commitTrendline,
    onCommitLevel: commitLevel,
    onPlotClick: selectHitDrawing,
    hitGrip: gripAt,
    onCommitEdit: commitEditedDrawing,
    onDeleteKey: () => {
      (props.onDeleteSelected ?? NOOP_DELETE_SELECTED)();
    },
  };

  const g: ChartGestures = createChartGestures(
    () => {
      return props.candles.length;
    },
    () => {
      return props.defaultVisible;
    },
    () => {
      return props.candles[0]?.time;
    },
    drawSlots,
  );

  // The near-edge fetch trigger — deliberately an effect, the only one in
  // the chart shells besides the prepend watcher below: syncing view state
  // (the viewport nearing the loaded series' left edge) to an external data
  // request is exactly what effects are for (ADR-005), unlike the brush
  // primitive's gesture translation which stays effect-free. One window of
  // margin: fetch before the user can hit the wall at normal pan speed,
  // never fetch on an idle chart.
  createEffect(() => {
    const viewport = g.viewport();
    const span = viewport.end - viewport.start;
    const nearLeftEdge = viewport.start < span;

    if (nearLeftEdge && !props.loadingOlder && !props.historyExhausted) {
      props.onLoadOlder();
    }
  });

  // Backfill prepend detection — same "an effect, not a tracked computation
  // feeding render" call as the near-edge fetch trigger above: every
  // trendline anchor is a candle INDEX, so a prepend (the series growing
  // while its first candle got OLDER) shifts every existing index by the
  // prepended count, or every drawing silently drifts onto the wrong
  // candles as older history loads in underneath it. `prevWatermark` is a
  // plain outer-scope `let`, but starts `null` and is only ever populated
  // from INSIDE the effect below — seeding it here instead (reading
  // `props.candles` at setup time, outside any tracked scope) is exactly
  // the untracked-reactive-read the solid/reactivity lint rule exists to
  // catch. The createComputed inside `createChartGestures` folds the
  // VIEWPORT through the identical growth-direction fork; this one folds
  // the DRAWINGS machine's anchor indices through the same fork, one level
  // up (CandleChart, not the gesture primitive), since only the caller
  // knows about drawings at all.
  let prevWatermark: PrependWatermark | null = null;

  createEffect(() => {
    const len = props.candles.length;
    const firstTime = props.candles[0]?.time;
    const prev = prevWatermark ?? { len, firstTime };

    prevWatermark = { len, firstTime };

    const grewBy = len - prev.len;

    if (
      grewBy > 0 &&
      prev.firstTime !== undefined &&
      firstTime !== undefined &&
      firstTime < prev.firstTime
    ) {
      (props.onShiftAnchors ?? NOOP_SHIFT_ANCHORS)(grewBy);
    }
  });

  const historyStart = createMemo((): boolean => {
    return props.historyExhausted && g.viewport().start === 0;
  });

  const vm = createMemo((): ChartVm => {
    return chartVm(props.candles, props.liveRate, props.flashOn, {
      viewport: g.viewport(),
      kind: props.kind,
      yScale: props.yScale ?? "linear",
    });
  });

  const cross = createMemo(() => {
    const cursor = g.cursor();

    if (!cursor) {
      return null;
    }

    return crosshairVm(
      cursor.xFrac,
      cursor.yFrac,
      props.candles,
      g.viewport(),
      vm().scale,
    );
  });

  // Hoisted once — both the indicator overlays and the RSI/MACD panes derive
  // from the same close series.
  const closes = createMemo((): readonly number[] => {
    return props.candles.map((c) => {
      return c.close;
    });
  });

  const indicatorPaths = createMemo((): readonly IndicatorPath[] => {
    return toIndicatorPaths(
      closes(),
      props.indicators,
      g.viewport(),
      vm().scale,
    );
  });

  const paneVms = createMemo((): readonly PaneVm[] => {
    return toPaneVms(props.panes, closes(), g.viewport(), cross());
  });

  // The in-progress trendline draft, appended as a sentinel-id "draft"
  // drawing so committed and preview rendering share one `drawingScene`
  // call — `DrawingsLayer` styles the `id === "draft"` item via
  // `data-draft="true"` (dashed, no handles), no special-casing here.
  // Snapping the draft's `a`/`b` through `pointerToAnchor` (the same
  // projection `commitTrendline` below uses to commit) means the preview
  // already sits exactly where the commit will land — no free-floating
  // preview that jumps to a candle center on release.
  // A drag-edit in flight previews by replacing the dragged drawing with its
  // dragDrawing projection — the SAME call the commit makes, so the preview
  // is byte-identical to what pointer-up will commit.
  const previewDrawings = createMemo((): readonly EqDrawing[] => {
    const committed = props.drawings ?? EMPTY_DRAWINGS;
    const edit = g.editDrag();

    if (!edit) {
      return committed;
    }

    return committed.map((d) => {
      return d.id === edit.grip.id
        ? dragDrawing(
            d,
            edit.grip,
            edit.from,
            edit.to,
            g.viewport(),
            vm().scale,
            props.candles.length,
          )
        : d;
    });
  });

  const allDrawings = createMemo((): readonly EqDrawing[] => {
    const d = g.draft();
    return d ? [...previewDrawings(), draftToDrawing(d)] : previewDrawings();
  });

  // EqDrawing (client-core) satisfies motion-core's structural `Drawing` —
  // passed directly, no mapping.
  const drawItems = createMemo((): readonly DrawingSceneItem[] => {
    return drawingScene(
      allDrawings(),
      g.viewport(),
      vm().scale,
      props.selectedDrawingId ?? null,
    );
  });

  function commitTrendline(a: PlotFrac, b: PlotFrac): void {
    const seriesLen = props.candles.length;
    (props.onCommitDrawing ?? NOOP_COMMIT_DRAWING)({
      id: crypto.randomUUID(),
      kind: "trendline",
      a: pointerToAnchor(a.xFrac, a.yFrac, g.viewport(), vm().scale, seriesLen),
      b: pointerToAnchor(b.xFrac, b.yFrac, g.viewport(), vm().scale, seriesLen),
    });
  }

  function commitLevel(p: PlotFrac): void {
    const anchor = pointerToAnchor(
      p.xFrac,
      p.yFrac,
      g.viewport(),
      vm().scale,
      props.candles.length,
    );
    (props.onCommitDrawing ?? NOOP_COMMIT_DRAWING)({
      id: crypto.randomUUID(),
      kind: "hline",
      price: anchor.price,
    });
  }

  function selectHitDrawing(p: PlotFrac): void {
    (props.onSelectDrawing ?? NOOP_SELECT_DRAWING)(
      hitTestDrawings(drawItems(), p.xFrac * 100, p.yFrac * 100),
    );
  }

  function gripAt(p: PlotFrac): DrawingGrip | null {
    return hitTestGrip(drawItems(), p.xFrac * 100, p.yFrac * 100);
  }

  function commitEditedDrawing(
    grip: DrawingGrip,
    from: PlotFrac,
    to: PlotFrac,
  ): void {
    const target = (props.drawings ?? EMPTY_DRAWINGS).find((d) => {
      return d.id === grip.id;
    });

    if (!target) {
      return;
    }

    (props.onUpdateDrawing ?? NOOP_UPDATE_DRAWING)(
      dragDrawing(
        target,
        grip,
        from,
        to,
        g.viewport(),
        vm().scale,
        props.candles.length,
      ),
    );
  }

  function draftToDrawing(d: DrawDraft): EqDrawing {
    const seriesLen = props.candles.length;
    return {
      id: "draft",
      kind: "trendline",
      a: pointerToAnchor(
        d.a.xFrac,
        d.a.yFrac,
        g.viewport(),
        vm().scale,
        seriesLen,
      ),
      b: pointerToAnchor(
        d.b.xFrac,
        d.b.yFrac,
        g.viewport(),
        vm().scale,
        seriesLen,
      ),
    };
  }

  const brush = createNavigatorBrush(
    g.viewport,
    g.applyViewport,
    () => {
      return props.candles.length;
    },
    () => {
      return props.candles[0]?.time;
    },
  );

  // The two navigator halves change at very different rates, so the line is
  // its own memo keyed on the series alone: a continuous brush drag
  // (viewport changing per pointer move) re-runs only the cheap window
  // style, never the full-history point mapping. `navLinePoints`' stable
  // output reference is also what lets NavigatorStrip's own memo cut-point
  // skip re-joining the SVG points string per frame.
  const navLinePoints = createMemo(() => {
    return navigatorLinePoints(props.candles);
  });

  const nav = createMemo((): NavigatorVm => {
    return {
      linePoints: navLinePoints(),
      windowStyle: navigatorWindowStyle(g.viewport(), props.candles.length),
    };
  });

  return (
    <ChartPlot
      vm={vm()}
      kind={props.kind}
      indicatorPaths={indicatorPaths()}
      drawItems={drawItems()}
      cross={cross()}
      atLiveEdge={g.atLiveEdge()}
      volumeBars={volumeVm(props.candles, g.viewport())}
      onBackToLive={g.resetToLive}
      plotProps={g.plotProps}
      plotRef={g.plotRef}
      nav={nav()}
      navProps={brush.stripProps}
      loadingOlder={props.loadingOlder}
      historyStart={historyStart()}
      panes={paneVms()}
      paneCrosshairStyle={cross()?.style ?? null}
      showHorizontal={g.cursor()?.inPlot ?? false}
      paneHoverProps={g.paneHoverProps}
    />
  );
}

/** The candle series' length + first-candle time as of the last effect run
 * — the prepend-detection effect's own watermark, compared against the
 * current run's values to tell a backfill prepend from a live append. */
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
  /** The timeframe's default visible-candle count (`CANDLE_DEFAULT_VISIBLE`)
   * — seeds `createChartGestures`'s initial/reset viewport. ChartPanel
   * already computes this from the selected timeframe. */
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
   * active). Drives `createChartGestures`' pointer-down fork (hline commits
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
  viewport: ChartViewport,
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
  viewport: ChartViewport,
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
