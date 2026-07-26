import { createMemo, type JSX } from "solid-js";

import type { EqChartType, EqIndicatorId } from "@rtc/client-core";
import type { Candle } from "@rtc/domain";
import {
  type ChartViewport,
  type ChartVm,
  chartVm,
  crosshairVm,
  indicatorPoints,
  indicatorValues,
  volumeVm,
} from "@rtc/motion-core";

import { ChartPlot } from "./ChartPlot";
import { type ChartGestures, createChartGestures } from "./createChartGestures";
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
  );

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
