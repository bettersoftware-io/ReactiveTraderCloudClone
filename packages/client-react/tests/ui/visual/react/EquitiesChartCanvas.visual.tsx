import type { ReactElement } from "react";

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
 * `useChartGestures` (no prop seam), so this mounts `ChartPlot` directly
 * with literal state computed via the same `@rtc/motion-core` calls
 * `CandleChart` itself makes in canvas mode (`chartScene`/`crosshairScene`/
 * `volumeScene`/`indicatorPoints`/`drawingScene` — mirroring
 * `CandleChart.tsx`'s own `canvasPlot` assembly). No gestures, no timers:
 * fully deterministic by construction, and safe to capture because
 * `SceneCanvas`'s draw runs in `useLayoutEffect`, before paint.
 *
 * Series/drawings are duplicated (not imported) from
 * `EquitiesChartInteractive.visual.tsx`'s `CANDLES`/`DRAWINGS` and
 * `EquitiesChartCompare`'s `COMPARE_SERIES` — each visual wrapper stays
 * self-contained per client, same convention as those files.
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

// Same formula as EquitiesChartInteractive.visual.tsx's COMPARE_SERIES —
// steeper slope so the two percent paths visibly diverge in the default
// {240,300} window.
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

// Same trendline+hline pair as EquitiesChartInteractive.visual.tsx's
// DRAWINGS, `t1` selected so its handles render.
const DRAWINGS: readonly EqDrawing[] = [
  {
    id: "t1",
    kind: "trendline",
    a: { index: 250, price: 349 },
    b: { index: 290, price: 392 },
  },
  { id: "h1", kind: "hline", price: 370 },
];

const STAGE_STYLE = {
  width: 760,
  height: 420,
  display: "flex",
  flexDirection: "column",
} as const;

export function EquitiesChartCanvas(): ReactElement {
  const viewport = defaultViewport(CANDLE_COUNT, DEFAULT_VISIBLE);
  const cursor = { xFrac: 0.5, yFrac: 0.4 };

  const vm = chartVm(CANDLES, LIVE_RATE, false, {
    viewport,
    kind: "candles",
    compare: { series: COMPARE_SERIES },
  });

  const scene = chartScene(CANDLES, LIVE_RATE, false, {
    viewport,
    kind: "candles",
    compare: { series: COMPARE_SERIES },
  });

  const cross = crosshairVm(
    cursor.xFrac,
    cursor.yFrac,
    CANDLES,
    viewport,
    vm.scale,
  );
  const atLiveEdge = isAtLiveEdge(viewport, CANDLE_COUNT);
  const drawItems = drawingScene(DRAWINGS, viewport, vm.scale, "t1");

  const canvasPlot: PlotCanvasScene = {
    scene,
    overlays: (["sma20", "ema50"] as const).map((id) => {
      return {
        id,
        points: indicatorPoints(
          indicatorValues(CLOSES, id),
          viewport,
          vm.scale,
        ),
      };
    }),
    drawings: drawItems,
    crosshair: crosshairScene(
      cursor.xFrac,
      cursor.yFrac,
      CANDLES,
      viewport,
      vm.scale,
    ),
  };

  const macdPane: PaneVm = {
    kind: "macd",
    scene: paneScene("macd", CLOSES, viewport),
    readout: cross ? paneReadout("macd", CLOSES, cross.idx) : null,
  };

  return (
    <div style={STAGE_STYLE}>
      <ChartPlot
        vm={vm}
        kind="candles"
        indicatorPaths={[]}
        drawItems={drawItems}
        cross={cross}
        atLiveEdge={atLiveEdge}
        volumeBars={volumeVm(CANDLES, viewport)}
        onBackToLive={() => {}}
        nav={navigatorVm(CANDLES, viewport)}
        loadingOlder={false}
        historyStart={false}
        panes={[macdPane]}
        paneCrosshairStyle={cross?.style ?? null}
        substrate="canvas"
        canvasPlot={canvasPlot}
        canvasVolume={volumeScene(CANDLES, viewport)}
      />
    </div>
  );
}
