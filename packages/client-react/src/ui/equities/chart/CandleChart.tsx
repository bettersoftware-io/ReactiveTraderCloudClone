import type { ReactElement } from "react";

import type { EqChartType, EqIndicatorId } from "@rtc/client-core";
import type { Candle } from "@rtc/domain";
import {
  chartVm,
  crosshairVm,
  indicatorPoints,
  indicatorValues,
  volumeVm,
} from "@rtc/motion-core";

import { BackToLiveButton } from "./BackToLiveButton";
import { CandleBars } from "./CandleBars";
import { CrosshairOverlay } from "./CrosshairOverlay";
import type { IndicatorPath } from "./SvgPathLayer";
import { SvgPathLayer } from "./SvgPathLayer";
import { TimeAxis } from "./TimeAxis";
import { type ChartGestures, useChartGestures } from "./useChartGestures";
import { VolumePane } from "./VolumePane";

import styles from "./CandleChart.module.css";

/**
 * The interactive price plot: owns the gesture hook (zoom/pan/crosshair —
 * `useChartGestures`) and composes the read-only render layers over it —
 * grid, price labels, candles/line/area, indicator overlays, crosshair,
 * back-to-live — plus the volume pane and time axis below the plot box.
 * `ChartPanel` stays a data/join component; this is where @rtc/motion-core's
 * chartVm/volumeVm/crosshairVm/indicator projections are actually consumed.
 */
export function CandleChart({
  candles,
  liveRate,
  flashOn,
  kind,
  indicators,
  defaultVisible,
}: CandleChartProps): ReactElement {
  // Destructured (not kept as one `g.foo` object) so each field's own type
  // drives the plugin's ref-safety analysis individually — `useChartGestures`
  // returns `plotRef` (a real ref) alongside plain values, and reading them
  // back out via member access on the whole object trips react-hooks/refs'
  // "could be a ref" heuristic for every property, not just the ref one.
  const { viewport, cursor, atLiveEdge, plotProps, plotRef, resetToLive } =
    useChartGestures(candles.length, defaultVisible);
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

  return (
    <div className={styles.wrap}>
      <div
        className={styles.plot}
        data-testid="chart-plot"
        tabIndex={0}
        role="application"
        aria-label="Price chart"
        ref={plotRef}
        {...plotProps}
      >
        {vm.grid.map((gr) => {
          return (
            <div
              key={gr.key}
              className={styles.grid}
              style={gr.style}
              data-testid="chart-grid-line"
            />
          );
        })}
        {vm.labels.map((l) => {
          return (
            <div
              key={l.key}
              className={styles.label}
              style={l.style}
              data-testid="chart-price-label"
            >
              {l.txt}
            </div>
          );
        })}
        {kind === "candles" && <CandleBars candles={vm.candles} />}
        <SvgPathLayer
          linePoints={vm.linePoints}
          kind={kind}
          indicatorPaths={indicatorPaths}
        />
        <CrosshairOverlay vm={cross} />
        {!atLiveEdge && <BackToLiveButton onClick={resetToLive} />}
      </div>
      <VolumePane bars={volumeVm(candles, viewport)} />
      <TimeAxis labels={vm.timeLabels} />
    </div>
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
