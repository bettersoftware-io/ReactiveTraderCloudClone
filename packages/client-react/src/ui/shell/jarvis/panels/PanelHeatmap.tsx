import type { ReactElement } from "react";

import type { PanelData } from "@rtc/client-core";

import styles from "./panels.module.css";

/** Dumb heatmap grid — row label + a row of tone/intensity-bucketed cells. */
export function PanelHeatmap({ rows }: PanelHeatmapProps): ReactElement {
  if (rows.length === 0) {
    return <div className={styles.empty}>No data yet</div>;
  }

  return (
    <div data-testid="jarvis-panel-heatmap" className={styles.heatmap}>
      {rows.map((row) => {
        return (
          <div key={row.label} className={styles.heatmapRow}>
            <div className={styles.heatmapRowLabel}>{row.label}</div>
            <div className={styles.heatmapCells}>
              {row.cells.map((cell) => {
                return (
                  <div
                    key={cell.label}
                    className={styles.heatmapCell}
                    data-intensity={intensityBucket(cell.intensity)}
                    title={`${cell.label}: ${cell.text}`}
                  >
                    <span key={cell.text} className={styles.flashOnChange}>
                      {cell.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** −1..1 intensity is bucketed into 7 discrete steps (-3..3) so colour comes
 * from a fixed CSS class per bucket (`data-intensity`) rather than a
 * per-cell inline style, which the repo's inline-style ESLint rule bans. */
function intensityBucket(intensity: number): string {
  const clamped = Math.max(-1, Math.min(1, intensity));
  return String(Math.round(clamped * 3));
}

// A named tag (rather than an inline `{ kind: "heatmap" }` literal) so
// `Extract<PanelData, ...>` never takes an inline object type argument (mirrors
// JarvisMachine.ts's `ConfirmRequestTag`).
interface HeatmapKindTag {
  readonly kind: "heatmap";
}
export type PanelHeatmapProps = Extract<PanelData, HeatmapKindTag>;
