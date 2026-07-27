import type { ReactElement } from "react";

import type { TimeLabelVm } from "@rtc/motion-core";

import styles from "./TimeAxis.module.css";

/**
 * The plot's time-axis strip below the volume pane: one label per
 * TimeLabelVm tick, positioned via its precomputed `--tx` custom property.
 * Pure props leaf.
 */
export function TimeAxis({ labels }: TimeAxisProps): ReactElement {
  return (
    <div className={styles.axis}>
      {labels.map((l) => {
        return (
          <div
            key={l.key}
            className={styles.label}
            style={l.style}
            data-testid="chart-time-label"
          >
            {l.txt}
          </div>
        );
      })}
    </div>
  );
}

export interface TimeAxisProps {
  readonly labels: readonly TimeLabelVm[];
}
