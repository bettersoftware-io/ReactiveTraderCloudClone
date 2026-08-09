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
 * vertical line and readout chip are unaffected. `linesHidden` hides BOTH
 * hairlines (the canvas substrate draws its own crosshair lines onto
 * `chart-canvas-plot` — see `drawPlotScene`'s crosshair pass — so the DOM
 * overlay keeps only the readout chip in canvas mode). `vm.price` (the cursor's
 * raw y→price inversion — distinct from the readout's snapped-candle OHLC)
 * has no visible glyph of its own; it rides as a `data-price` attribute on
 * the readout chip (mirroring the `data-active`/`data-yscale`-style
 * observer attributes elsewhere in this chart) so the log-mode inversion is
 * assertable without adding pixels a golden would have to re-pin.
 */
export function CrosshairOverlay({
  vm,
  showHorizontal,
  linesHidden = false,
}: CrosshairOverlayProps): ReactElement | null {
  if (!vm) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      {linesHidden ? null : (
        <div
          className={styles.v}
          style={vm.style}
          data-testid="chart-crosshair-v"
        />
      )}
      {showHorizontal && !linesHidden ? (
        <div
          className={styles.h}
          style={vm.style}
          data-testid="chart-crosshair-h"
        />
      ) : null}
      <div
        className={styles.readout}
        data-testid="chart-crosshair-readout"
        data-price={vm.price}
      >
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
  /** Hides both hairlines while keeping the readout chip — set in canvas
   * mode, where `chart-canvas-plot` already draws its own crosshair lines.
   * Defaults to `false` (unchanged DOM-mode behaviour). */
  readonly linesHidden?: boolean;
}
