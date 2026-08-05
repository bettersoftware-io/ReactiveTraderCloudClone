import type { ReactElement } from "react";

import type { PanelData } from "@rtc/client-core";

import styles from "./panels.module.css";

/** Dumb grid of mini sparkline cells — label + tiny SVG line + change,
 * tone-coloured. Mirrors `TileChart`'s hand-rolled SVG-path approach. */
export function PanelSparkGrid({ cells }: PanelSparkGridProps): ReactElement {
  if (cells.length === 0) {
    return <div className={styles.empty}>No data yet</div>;
  }

  return (
    <div data-testid="jarvis-panel-spark-grid" className={styles.sparkGrid}>
      {cells.map((cell) => {
        return (
          <div
            key={cell.label}
            className={styles.sparkCell}
            data-tone={cell.tone}
          >
            <div className={styles.sparkCellLabel}>{cell.label}</div>
            <svg
              className={styles.sparkCellChart}
              viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                className={styles.sparkCellPath}
                data-tone={cell.tone}
                d={buildSparkPath(cell.points)}
                fill="none"
              />
            </svg>
            <div className={styles.sparkCellChange} data-tone={cell.tone}>
              <span key={cell.change} className={styles.flashOnChange}>
                {cell.change}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildSparkPath(points: readonly number[]): string {
  if (points.length < 2) {
    return "";
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = SPARK_WIDTH / (points.length - 1);

  return points
    .map((v, i) => {
      const px = i * step;
      const py = SPARK_HEIGHT - ((v - min) / range) * SPARK_HEIGHT;
      return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
}

const SPARK_WIDTH = 80;
const SPARK_HEIGHT = 24;

// A named tag (rather than an inline `{ kind: "sparkGrid" }` literal) so
// `Extract<PanelData, ...>` never takes an inline object type argument (mirrors
// JarvisMachine.ts's `ConfirmRequestTag`).
interface SparkGridKindTag {
  readonly kind: "sparkGrid";
}
export type PanelSparkGridProps = Extract<PanelData, SparkGridKindTag>;
