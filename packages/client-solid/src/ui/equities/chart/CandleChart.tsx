import { createEffect, createMemo, type JSX } from "solid-js";

import type { EqChartType, EqIndicatorId, EqPaneId } from "@rtc/client-core";
import type { Candle } from "@rtc/domain";
import {
  type ChartViewport,
  type ChartVm,
  chartVm,
  crosshairVm,
  indicatorPoints,
  indicatorValues,
  type NavigatorVm,
  navigatorLinePoints,
  navigatorWindowStyle,
  paneReadout,
  paneScene,
  volumeVm,
} from "@rtc/motion-core";

import { ChartPlot, type PaneVm } from "./ChartPlot";
import { type ChartGestures, createChartGestures } from "./createChartGestures";
import { createNavigatorBrush } from "./createNavigatorBrush";
import type { IndicatorPath } from "./SvgPathLayer";

/**
 * The interactive price plot's data/gesture join: owns the gesture primitive
 * (zoom/pan/crosshair — `createChartGestures`), the `@rtc/motion-core`
 * chartVm/volumeVm/crosshairVm/indicator projections, and hands the result to
 * `ChartPlot` — the presentational leaf that actually renders the DOM.
 * `ChartPanel` stays a data/join component one level up; this is the seam
 * between the two.
 */
export function CandleChart(props: CandleChartProps): JSX.Element {
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
  );

  // The near-edge fetch trigger — deliberately an effect, the only one in
  // the chart shells: syncing view state (the viewport nearing the loaded
  // series' left edge) to an external data request is exactly what effects
  // are for (ADR-005), unlike the brush primitive's gesture translation
  // which stays effect-free. One window of margin: fetch before the user
  // can hit the wall at normal pan speed, never fetch on an idle chart.
  createEffect(() => {
    const viewport = g.viewport();
    const span = viewport.end - viewport.start;
    const nearLeftEdge = viewport.start < span;

    if (nearLeftEdge && !props.loadingOlder && !props.historyExhausted) {
      props.onLoadOlder();
    }
  });

  const historyStart = createMemo((): boolean => {
    return props.historyExhausted && g.viewport().start === 0;
  });

  const vm = createMemo((): ChartVm => {
    return chartVm(props.candles, props.liveRate, props.flashOn, {
      viewport: g.viewport(),
      kind: props.kind,
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

export interface CandleChartProps {
  candles: readonly Candle[];
  liveRate: number;
  flashOn: boolean;
  kind: EqChartType;
  indicators: readonly EqIndicatorId[];
  /** The active RSI/MACD panes, in render order (empty renders none). */
  panes: readonly EqPaneId[];
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
}

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
