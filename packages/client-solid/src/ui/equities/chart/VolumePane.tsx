import type { JSX } from "@solidjs/web";
import { type Accessor, For, Show } from "solid-js";

import {
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
          <For keyed={false} each={props.bars}>
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
          </For>
        }
      >
        {(canvasBars: Accessor<readonly VolumeSceneBar[]>): JSX.Element => {
          return (
            <SceneCanvas
              testid="chart-canvas-volume"
              scene={canvasBars()}
              draw={drawVolumeScene}
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
