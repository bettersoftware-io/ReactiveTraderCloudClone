import type { JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import type { PanelData } from "@rtc/client-core";

import styles from "./panels.module.css";

/** Dumb grid of mini sparkline cells — label + tiny SVG line + change,
 * tone-coloured. Mirrors `TileChart`'s hand-rolled SVG-path approach.
 *
 * Cells are addressed by `cell.label` (the id-then-lookup pattern shared
 * with `CreditBlotter.tsx` / `RfqsPanel.tsx`), not object identity — a fresh
 * cell object every tick is looked up by its stable label, and `<Show
 * keyed>` remounts the cell (retriggering `.flashOnChange`, the Solid
 * analogue of React's `key`-based remount) only when its resolved data
 * genuinely differs. */
export function PanelSparkGrid(props: PanelSparkGridProps): JSX.Element {
  const cellLabels = createMemo((): string[] => {
    return props.cells.map((cell) => {
      return cell.label;
    });
  });

  return (
    <Show
      when={props.cells.length > 0}
      fallback={<div class={styles.empty}>No data yet</div>}
    >
      <div data-testid="jarvis-panel-spark-grid" class={styles.sparkGrid}>
        <For each={cellLabels()}>
          {(label: string): JSX.Element => {
            const cell = createMemo((): SparkCell | undefined => {
              return props.cells.find((c) => {
                return c.label === label;
              });
            });

            return (
              <Show when={cell()} keyed>
                {(currentCell: SparkCell): JSX.Element => {
                  return (
                    <div class={styles.sparkCell} data-tone={currentCell.tone}>
                      <div class={styles.sparkCellLabel}>
                        {currentCell.label}
                      </div>
                      <svg
                        class={styles.sparkCellChart}
                        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path
                          class={styles.sparkCellPath}
                          data-tone={currentCell.tone}
                          d={buildSparkPath(currentCell.points)}
                          fill="none"
                        />
                      </svg>
                      <div
                        class={styles.sparkCellChange}
                        data-tone={currentCell.tone}
                      >
                        <span class={styles.flashOnChange}>
                          {currentCell.change}
                        </span>
                      </div>
                    </div>
                  );
                }}
              </Show>
            );
          }}
        </For>
      </div>
    </Show>
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
// react's PanelSparkGrid.tsx / JarvisMachine.ts's `ConfirmRequestTag`).
interface SparkGridKindTag {
  readonly kind: "sparkGrid";
}
export type PanelSparkGridProps = Extract<PanelData, SparkGridKindTag>;
type SparkCell = PanelSparkGridProps["cells"][number];
