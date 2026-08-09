import { type Accessor, Index, type JSX, Show } from "solid-js";

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
 * Pure props leaf. `canvasBars` swaps the DOM bar divs for one
 * `SceneCanvas` (the canvas substrate) — the pane frame/border stays.
 */
export function VolumePane(props: VolumePaneProps): JSX.Element {
  return (
    <div class={styles.pane}>
      <Show
        when={props.canvasBars}
        fallback={
          <Index each={props.bars}>
            {(b: Accessor<VolumeBarVm>): JSX.Element => {
              return (
                <div
                  class={styles.bar}
                  style={b().style}
                  data-up={String(b().up)}
                  data-testid="chart-volume-bar"
                />
              );
            }}
          </Index>
        }
      >
        {(canvasBars: Accessor<readonly VolumeSceneBar[]>): JSX.Element => {
          return (
            <SceneCanvas
              testid="chart-canvas-volume"
              draw={(
                ctx: Canvas2D,
                palette: ChartPalette,
                size: CanvasSize,
              ) => {
                drawVolumeScene(ctx, canvasBars(), palette, size);
              }}
            />
          );
        }}
      </Show>
    </div>
  );
}

export interface VolumePaneProps {
  readonly bars: readonly VolumeBarVm[];
  /** Canvas-substrate bars — when set, renders one `SceneCanvas` instead of
   * per-bar divs. Omitted (or `undefined`) keeps the DOM bars. */
  readonly canvasBars?: readonly VolumeSceneBar[];
}
