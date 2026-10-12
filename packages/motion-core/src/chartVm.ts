import { chartVmFromScene, volumeBarsFromScene } from "./chartCssVars.js";
import {
  type ChartCandle,
  type ChartPoint,
  type ChartScale,
  type ChartVarStyle,
  type ChartVmOptions,
  chartScene,
  volumeScene,
} from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";

export {
  type ChartCandle,
  type ChartCompareInput,
  type ChartKind,
  type ChartPoint,
  type ChartScale,
  type ChartVarStyle,
  type ChartVmOptions,
  formatTimeLabel,
  Y_SPAN,
  Y_TOP,
} from "./chartScene.js";

/** A time-axis tick, keyed to the series index it labels (stable while
 * panning) rather than to its position within the current viewport. */
export interface TimeLabelVm {
  readonly key: number;
  readonly txt: string;
  readonly style: ChartVarStyle;
}

interface CandleVm {
  key: number;
  up: boolean;
  last: boolean;
  glow: boolean;
  style: ChartVarStyle;
  wickStyle: ChartVarStyle;
}

interface GridLineVm {
  key: number;
  style: ChartVarStyle;
}

interface PriceLabelVm {
  key: number;
  txt: string;
  style: ChartVarStyle;
}

export interface ChartVm {
  candles: readonly CandleVm[];
  grid: readonly GridLineVm[];
  labels: readonly PriceLabelVm[];
  linePoints: readonly ChartPoint[];
  compareLinePoints: readonly ChartPoint[];
  timeLabels: readonly TimeLabelVm[];
  scale: ChartScale;
}

/** A volume bar, scaled to the visible slice's max volume. */
export interface VolumeBarVm {
  readonly key: number;
  readonly up: boolean;
  readonly style: ChartVarStyle;
}

export function chartVm(
  series: readonly ChartCandle[],
  liveRate: number,
  flashOn: boolean,
  opts?: ChartVmOptions,
): ChartVm {
  return chartVmFromScene(chartScene(series, liveRate, flashOn, opts));
}

export function volumeVm(
  series: readonly ChartCandle[],
  viewport?: ChartViewport,
): readonly VolumeBarVm[] {
  return volumeBarsFromScene(volumeScene(series, viewport));
}
