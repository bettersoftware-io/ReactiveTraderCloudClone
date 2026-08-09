import type { ReactElement } from "react";

import {
  type Canvas2D,
  type CanvasSize,
  type ChartPalette,
  drawVolumeScene,
  type VolumeBarVm,
  type VolumeSceneBar,
} from "@rtc/motion-core";

import { SceneCanvas } from "./SceneCanvas";

import styles from "./VolumePane.module.css";

/**
 * The volume histogram between the plot and the time axis: one bar per
 * visible candle, scaled to the visible slice's max volume by `volumeVm`.
 * Pure props leaf. When `canvasBars` is supplied it renders a single
 * `chart-canvas-volume` `SceneCanvas` instead of one div per bar — the pane
 * frame/border stay the same either way.
 */
export function VolumePane({
  bars,
  canvasBars,
}: VolumePaneProps): ReactElement {
  return (
    <div className={styles.pane}>
      {canvasBars ? (
        <SceneCanvas
          testid="chart-canvas-volume"
          draw={(ctx: Canvas2D, palette: ChartPalette, size: CanvasSize) => {
            drawVolumeScene(ctx, canvasBars, palette, size);
          }}
        />
      ) : (
        bars.map((b) => {
          return (
            <div
              key={b.key}
              className={styles.bar}
              style={b.style}
              data-up={String(b.up)}
              data-testid="chart-volume-bar"
            />
          );
        })
      )}
    </div>
  );
}

export interface VolumePaneProps {
  readonly bars: readonly VolumeBarVm[];
  /** Canvas-mode bars — when supplied, replaces the per-bar divs with one
   * `SceneCanvas`. Omitted in DOM mode. */
  readonly canvasBars?: readonly VolumeSceneBar[];
}
