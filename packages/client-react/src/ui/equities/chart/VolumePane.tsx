import type { ReactElement } from "react";

import type { VolumeBarVm } from "@rtc/motion-core";

import styles from "./VolumePane.module.css";

/**
 * The volume histogram between the plot and the time axis: one bar per
 * visible candle, scaled to the visible slice's max volume by `volumeVm`.
 * Pure props leaf.
 */
export function VolumePane({ bars }: VolumePaneProps): ReactElement {
  return (
    <div className={styles.pane}>
      {bars.map((b) => {
        return (
          <div
            key={b.key}
            className={styles.bar}
            style={b.style}
            data-up={String(b.up)}
            data-testid="chart-volume-bar"
          />
        );
      })}
    </div>
  );
}

export interface VolumePaneProps {
  readonly bars: readonly VolumeBarVm[];
}
