import { type ReactElement, useEffect } from "react";

import type { EqChartType, EqIndicatorId } from "@rtc/client-core";
import type { Candle } from "@rtc/domain";
import {
  chartVm,
  crosshairVm,
  indicatorPoints,
  indicatorValues,
  navigatorVm,
  volumeVm,
} from "@rtc/motion-core";

import { ChartPlot } from "./ChartPlot";
import type { IndicatorPath } from "./SvgPathLayer";
import { type ChartGestures, useChartGestures } from "./useChartGestures";
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
  defaultVisible,
  loadingOlder,
  historyExhausted,
  onLoadOlder,
}: CandleChartProps): ReactElement {
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
  } = useChartGestures(candles.length, defaultVisible, candles[0]?.time);

  // The near-edge fetch trigger — deliberately an EFFECT, the only one in
  // the chart shells: syncing view state (the viewport nearing the loaded
  // series' left edge) to an external data request is exactly what effects
  // are for (ADR-005), unlike the brush shells' gesture translation which
  // stays effect-free. One window of margin: fetch before the user can hit
  // the wall at normal pan speed, never fetch on an idle chart.
  const span = viewport.end - viewport.start;
  const nearLeftEdge = viewport.start < span;

  useEffect(() => {
    if (nearLeftEdge && !loadingOlder && !historyExhausted) {
      onLoadOlder();
    }
  }, [nearLeftEdge, loadingOlder, historyExhausted, onLoadOlder]);

  const historyStart = historyExhausted && viewport.start === 0;

  const vm = chartVm(candles, liveRate, flashOn, { viewport, kind });
  const cross = cursor
    ? crosshairVm(cursor.xFrac, cursor.yFrac, candles, viewport, vm.scale)
    : null;

  const indicatorPaths = toIndicatorPaths(
    candles,
    indicators,
    viewport,
    vm.scale,
  );

  const brush = useNavigatorBrush(viewport, applyViewport, candles.length);
  const nav = navigatorVm(candles, viewport);

  return (
    <ChartPlot
      vm={vm}
      kind={kind}
      indicatorPaths={indicatorPaths}
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
}

/** Projects each active indicator's value series into the visible viewport,
 * pre-joined into the SVG `points` string SvgPathLayer renders verbatim
 * (vm owns numbers, shell owns markup strings). */
function toIndicatorPaths(
  candles: readonly Candle[],
  indicators: readonly EqIndicatorId[],
  viewport: ChartGestures["viewport"],
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
