import { createEffect, createMemo, type JSX } from "solid-js";

import type { EqChartType, EqIndicatorId } from "@rtc/client-core";
import type { Candle } from "@rtc/domain";
import {
  type ChartViewport,
  type ChartVm,
  chartVm,
  crosshairVm,
  indicatorPoints,
  indicatorValues,
  type NavigatorVm,
  navigatorVm,
  volumeVm,
} from "@rtc/motion-core";

import { ChartPlot } from "./ChartPlot";
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

  const indicatorPaths = createMemo((): readonly IndicatorPath[] => {
    return toIndicatorPaths(
      props.candles,
      props.indicators,
      g.viewport(),
      vm().scale,
    );
  });

  const brush = createNavigatorBrush(g.viewport, g.applyViewport, () => {
    return props.candles.length;
  });

  const nav = createMemo((): NavigatorVm => {
    return navigatorVm(props.candles, g.viewport());
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
    />
  );
}

export interface CandleChartProps {
  candles: readonly Candle[];
  liveRate: number;
  flashOn: boolean;
  kind: EqChartType;
  indicators: readonly EqIndicatorId[];
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
  candles: readonly Candle[],
  indicators: readonly EqIndicatorId[],
  viewport: ChartViewport,
  scale: Parameters<typeof indicatorPoints>[2],
): readonly IndicatorPath[] {
  const closes = candles.map((c) => {
    return c.close;
  });

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
