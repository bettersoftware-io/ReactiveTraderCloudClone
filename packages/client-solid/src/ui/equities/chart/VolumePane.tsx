import { For, type JSX } from "solid-js";

import type { VolumeBarVm } from "@rtc/motion-core";

import styles from "./VolumePane.module.css";

/**
 * The volume histogram between the plot and the time axis: one bar per
 * visible candle, scaled to the visible slice's max volume by `volumeVm`.
 * Pure props leaf.
 */
export function VolumePane(props: VolumePaneProps): JSX.Element {
  return (
    <div class={styles.pane}>
      <For each={props.bars}>
        {(b: VolumeBarVm): JSX.Element => {
          return (
            <div
              class={styles.bar}
              style={b.style}
              data-up={String(b.up)}
              data-testid="chart-volume-bar"
            />
          );
        }}
      </For>
    </div>
  );
}

export interface VolumePaneProps {
  readonly bars: readonly VolumeBarVm[];
}
