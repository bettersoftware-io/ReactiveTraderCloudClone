import { type Accessor, Index, type JSX } from "solid-js";

import type { TimeLabelVm } from "@rtc/motion-core";

import styles from "./TimeAxis.module.css";

/**
 * The plot's time-axis strip below the volume pane: one label per
 * TimeLabelVm tick, positioned via its precomputed `--tx` custom property.
 * Pure props leaf.
 */
export function TimeAxis(props: TimeAxisProps): JSX.Element {
  return (
    <div class={styles.axis}>
      <Index each={props.labels}>
        {(l: Accessor<TimeLabelVm>): JSX.Element => {
          return (
            <div
              class={styles.label}
              style={l().style}
              data-testid="chart-time-label"
            >
              {l().txt}
            </div>
          );
        }}
      </Index>
    </div>
  );
}

export interface TimeAxisProps {
  readonly labels: readonly TimeLabelVm[];
}
