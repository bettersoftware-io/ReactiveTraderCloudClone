import type { JSX } from "solid-js";

import type { EqDrawing } from "@rtc/client-core";
import type { Candle } from "@rtc/domain";
import {
  chartScene,
  chartVm,
  crosshairScene,
  crosshairVm,
  defaultViewport,
  drawingScene,
  indicatorPoints,
  indicatorValues,
  isAtLiveEdge,
  navigatorVm,
  type PlotCanvasScene,
  paneReadout,
  paneScene,
  volumeScene,
  volumeVm,
} from "@rtc/motion-core";

import type { PaneVm } from "#/ui/equities/chart/ChartPlot";
import { ChartPlot } from "#/ui/equities/chart/ChartPlot";

/**
 * Golden-only composite scenario for the canvas substrate (Task 6, spec
 * 2026-08-09-canvas-substrate): mounts the real `ChartPlot` with
 * `substrate="canvas"` and a single rich, literal, forced state — every
 * canvas-substrate layer in one capture (candles + volume + compare +
 * drawings + one MACD pane + a pinned crosshair) — rather than the many
 * single-layer scenarios `EquitiesChartInteractive.visual.tsx`/
 * `EquitiesChartPanes.visual.tsx` use for DOM-substrate coverage. Same
 * bypass as those files: `CandleChart` owns its viewport/cursor via
 * `createChartGestures` (no prop seam), so this mounts `ChartPlot` directly
 * with literal state computed via the same `@rtc/motion-core` calls
 * `CandleChart` itself makes in canvas mode (`chartScene`/`crosshairScene`/
 * `volumeScene`/`indicatorPoints`/`drawingScene` — mirroring
 * `CandleChart.tsx`'s own `canvasPlot` assembly). No gestures, no timers,
 * and every value below is computed once at module/render scope (no
 * signals) since nothing here ever changes — deterministic by
 * construction, and safe to capture because `SceneCanvas`'s draw runs
 * pre-paint.
 *
 * Series/drawings are duplicated (not imported) from the React twin's
 * `CANDLES`/`DRAWINGS`/`COMPARE_SERIES` — each visual wrapper stays
 * self-contained per client, same convention as the other forced-state
 * chart scenarios in this directory.
 */

const CANDLE_COUNT = 300;
const BUCKET_MS = 60_000;
const DEFAULT_VISIBLE = 60;

function candleAt(i: number): Candle {
  const open = 100 + i;
  const close = i % 2 === 0 ? open + 1 : open - 1;

  return {
    time: i * BUCKET_MS,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1_000_000 + i * 1_000,
  };
}

const CANDLES: readonly Candle[] = Array.from(
  { length: CANDLE_COUNT },
  (_, i) => {
    return candleAt(i);
  },
);
const LIVE_RATE: number = (CANDLES[CANDLES.length - 1] ?? candleAt(0)).close;
const CLOSES: readonly number[] = CANDLES.map((c) => {
  return c.close;
});

// The macd pane draws from its own zigzag close series, not CLOSES: the
// main series' smooth climb makes MACD's histogram sub-pixel (the exact
// finding EquitiesChartPanes.visual.tsx documents for its BOTH_* fixture),
// which left the composite golden's histogram invisible. Fixed-length legs
// reversing every PANE_LEG_LEN candles keep macd/signal crossing and the
// histogram multi-pixel in both directions — deterministic literal formula,
// and the pane readout reads the SAME series so text matches the pixels.
const PANE_LEG_LEN = 15;
const PANE_STEP = 2;
const PANE_START_PRICE = 200;

function buildPaneCloses(): readonly number[] {
  const out: number[] = [];
  let close = PANE_START_PRICE;

  for (let i = 0; i < CANDLE_COUNT; i++) {
    const direction = Math.floor(i / PANE_LEG_LEN) % 2 === 0 ? 1 : -1;
    close += direction * PANE_STEP;
    out.push(close);
  }

  return out;
}

const PANE_CLOSES: readonly number[] = buildPaneCloses();

// Same formula as the React twin's COMPARE_SERIES — steeper slope so the two
// percent paths visibly diverge in the default {240,300} window.
const COMPARE_SERIES: readonly Candle[] = Array.from(
  { length: CANDLE_COUNT },
  (_, i) => {
    const open = 50 + i * 2;
    return {
      time: i * BUCKET_MS,
      open,
      high: open + 2,
      low: open - 2,
      close: open + 1,
      volume: 1_000,
    };
  },
);

// Same trendline+hline pair as the React twin's DRAWINGS, `t1` selected so
// its handles render.
const DRAWINGS: readonly EqDrawing[] = [
  {
    id: "t1",
    kind: "trendline",
    a: { index: 250, price: 349 },
    b: { index: 290, price: 392 },
  },
  { id: "h1", kind: "hline", price: 370 },
];

const STAGE_STYLE: JSX.CSSProperties = {
  width: "760px",
  height: "420px",
  display: "flex",
  "flex-direction": "column",
};

const VIEWPORT = defaultViewport(CANDLE_COUNT, DEFAULT_VISIBLE);
const CURSOR = { xFrac: 0.5, yFrac: 0.4 };

const VM = chartVm(CANDLES, LIVE_RATE, false, {
  viewport: VIEWPORT,
  kind: "candles",
  compare: { series: COMPARE_SERIES },
});

const SCENE = chartScene(CANDLES, LIVE_RATE, false, {
  viewport: VIEWPORT,
  kind: "candles",
  compare: { series: COMPARE_SERIES },
});

const CROSS = crosshairVm(
  CURSOR.xFrac,
  CURSOR.yFrac,
  CANDLES,
  VIEWPORT,
  VM.scale,
);
const AT_LIVE_EDGE = isAtLiveEdge(VIEWPORT, CANDLE_COUNT);
const DRAW_ITEMS = drawingScene(DRAWINGS, VIEWPORT, VM.scale, "t1");

const CANVAS_PLOT: PlotCanvasScene = {
  scene: SCENE,
  overlays: (["sma20", "ema50"] as const).map((id) => {
    return {
      id,
      points: indicatorPoints(indicatorValues(CLOSES, id), VIEWPORT, VM.scale),
    };
  }),
  drawings: DRAW_ITEMS,
  crosshair: crosshairScene(
    CURSOR.xFrac,
    CURSOR.yFrac,
    CANDLES,
    VIEWPORT,
    VM.scale,
  ),
};

const MACD_PANE: PaneVm = {
  kind: "macd",
  scene: paneScene("macd", PANE_CLOSES, VIEWPORT),
  readout: CROSS ? paneReadout("macd", PANE_CLOSES, CROSS.idx) : null,
};

export function EquitiesChartCanvas(): JSX.Element {
  return (
    <div style={STAGE_STYLE}>
      <ChartPlot
        vm={VM}
        kind="candles"
        indicatorPaths={[]}
        drawItems={DRAW_ITEMS}
        cross={CROSS}
        atLiveEdge={AT_LIVE_EDGE}
        volumeBars={volumeVm(CANDLES, VIEWPORT)}
        onBackToLive={() => {}}
        nav={navigatorVm(CANDLES, VIEWPORT)}
        loadingOlder={false}
        historyStart={false}
        panes={[MACD_PANE]}
        paneCrosshairStyle={CROSS?.style ?? null}
        substrate="canvas"
        canvasPlot={CANVAS_PLOT}
        canvasVolume={volumeScene(CANDLES, VIEWPORT)}
      />
    </div>
  );
}
