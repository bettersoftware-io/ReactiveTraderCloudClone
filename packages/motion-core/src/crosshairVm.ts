import { crosshairVmFromScene } from "./chartCssVars.js";
import type { ChartCandle, ChartScale, ChartVarStyle } from "./chartScene.js";
import { crosshairScene } from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";

/** The crosshair's snapped position plus its preformatted OHLCV readout. */
export interface CrosshairVm {
  readonly idx: number;
  readonly style: ChartVarStyle;
  readonly price: string;
  readonly readout: {
    readonly time: string;
    readonly open: string;
    readonly high: string;
    readonly low: string;
    readonly close: string;
    readonly volume: string;
  };
}

export function crosshairVm(
  xFrac: number,
  yFrac: number,
  series: readonly ChartCandle[],
  viewport: ChartViewport,
  scale: ChartScale,
): CrosshairVm | null {
  return crosshairVmFromScene(
    crosshairScene(xFrac, yFrac, series, viewport, scale),
  );
}
