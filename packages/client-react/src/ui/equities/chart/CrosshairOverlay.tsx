import type { ReactElement } from "react";

import type { CrosshairVm } from "@rtc/motion-core";

import styles from "./CrosshairOverlay.module.css";

/**
 * The plot's crosshair: a vertical + horizontal hairline pinned to the
 * hovered candle (via CrosshairVm's precomputed `--chx`/`--chy` custom
 * properties) plus a small OHLCV + time readout chip pinned top-left of the
 * plot. Pure props leaf — `pointer-events: none` throughout (module css) so
 * the overlay never intercepts the plot's own gesture handlers. Renders
 * nothing while no candle is hovered (`vm` null). `showHorizontal` hides
 * just the `.h` hairline while the hover has moved into an indicator pane
 * instead (see `ChartPlot`'s `showHorizontal={cursor?.inPlot}` wiring) — the
 * vertical line and readout chip are unaffected.
 */
export function CrosshairOverlay({
  vm,
  showHorizontal,
}: CrosshairOverlayProps): ReactElement | null {
  if (!vm) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div
        className={styles.v}
        style={vm.style}
        data-testid="chart-crosshair-v"
      />
      {showHorizontal ? (
        <div
          className={styles.h}
          style={vm.style}
          data-testid="chart-crosshair-h"
        />
      ) : null}
      <div className={styles.readout} data-testid="chart-crosshair-readout">
        <span>{vm.readout.time}</span>
        <span>O {vm.readout.open}</span>
        <span>H {vm.readout.high}</span>
        <span>L {vm.readout.low}</span>
        <span>C {vm.readout.close}</span>
        <span>V {vm.readout.volume}</span>
      </div>
    </div>
  );
}

export interface CrosshairOverlayProps {
  readonly vm: CrosshairVm | null;
  readonly showHorizontal: boolean;
}
