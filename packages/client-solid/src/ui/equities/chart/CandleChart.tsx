import { createMemo, For, type JSX, Show } from "solid-js";

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

import { BackToLiveButton } from "./BackToLiveButton";
import { CandleBars } from "./CandleBars";
import { CrosshairOverlay } from "./CrosshairOverlay";
import { type ChartGestures, createChartGestures } from "./createChartGestures";
import type { IndicatorPath } from "./SvgPathLayer";
import { SvgPathLayer } from "./SvgPathLayer";
import { TimeAxis } from "./TimeAxis";
import { VolumePane } from "./VolumePane";

import styles from "./CandleChart.module.css";

/**
 * The interactive price plot: owns the gesture primitive (zoom/pan/crosshair
 * — `createChartGestures`) and composes the read-only render layers over it
 * — grid, price labels, candles/line/area, indicator overlays, crosshair,
 * back-to-live — plus the volume pane and time axis below the plot box.
 * `ChartPanel` stays a data/join component; this is where @rtc/motion-core's
 * chartVm/volumeVm/crosshairVm/indicator projections are actually consumed.
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
    <div class={styles.wrap}>
      <div
        class={styles.plot}
        data-testid="chart-plot"
        tabIndex={0}
        role="application"
        aria-label="Price chart"
        ref={g.plotRef}
        onPointerDown={g.plotProps.onPointerDown}
        onPointerMove={g.plotProps.onPointerMove}
        onPointerUp={g.plotProps.onPointerUp}
        onPointerCancel={g.plotProps.onPointerCancel}
        onPointerLeave={g.plotProps.onPointerLeave}
        onDblClick={g.plotProps.onDblClick}
        onKeyDown={g.plotProps.onKeyDown}
      >
        <For each={vm().grid}>
          {(gr: ChartVm["grid"][number]): JSX.Element => {
            return (
              <div
                class={styles.grid}
                style={gr.style}
                data-testid="chart-grid-line"
              />
            );
          }}
        </For>
        <For each={vm().labels}>
          {(l: ChartVm["labels"][number]): JSX.Element => {
            return (
              <div
                class={styles.label}
                style={l.style}
                data-testid="chart-price-label"
              >
                {l.txt}
              </div>
            );
          }}
        </For>
        <Show when={props.kind === "candles"}>
          <CandleBars candles={vm().candles} />
        </Show>
        <SvgPathLayer
          linePoints={vm().linePoints}
          kind={props.kind}
          indicatorPaths={indicatorPaths()}
        />
        <CrosshairOverlay vm={cross()} />
        <Show when={!g.atLiveEdge()}>
          <BackToLiveButton onClick={g.resetToLive} />
        </Show>
      </div>
      <VolumePane bars={volumeVm(props.candles, g.viewport())} />
      <TimeAxis labels={vm().timeLabels} />
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
