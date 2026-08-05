import type { JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import type { PanelData } from "@rtc/client-core";

import styles from "./panels.module.css";

/** Dumb heatmap grid — row label + a row of tone/intensity-bucketed cells.
 *
 * Rows and cells are addressed by their (assumed-stable) `label`, not object
 * identity — the id-then-lookup pattern shared with `CreditBlotter.tsx` /
 * `RfqsPanel.tsx`. `<Show keyed>` at the cell level remounts a cell
 * (retriggering `.flashOnChange`, the Solid analogue of React's `key`-based
 * remount) only when its resolved data genuinely differs. */
export function PanelHeatmap(props: PanelHeatmapProps): JSX.Element {
  const rowLabels = createMemo((): string[] => {
    return props.rows.map((row) => {
      return row.label;
    });
  });

  return (
    <Show
      when={props.rows.length > 0}
      fallback={<div class={styles.empty}>No data yet</div>}
    >
      <div data-testid="jarvis-panel-heatmap" class={styles.heatmap}>
        <For each={rowLabels()}>
          {(rowLabel: string): JSX.Element => {
            const row = createMemo((): HeatmapRow | undefined => {
              return props.rows.find((r) => {
                return r.label === rowLabel;
              });
            });

            return (
              <Show when={row()} keyed>
                {(currentRow: HeatmapRow): JSX.Element => {
                  const cellLabels = createMemo((): string[] => {
                    return currentRow.cells.map((cell) => {
                      return cell.label;
                    });
                  });

                  return (
                    <div class={styles.heatmapRow}>
                      <div class={styles.heatmapRowLabel}>
                        {currentRow.label}
                      </div>
                      <div class={styles.heatmapCells}>
                        <For each={cellLabels()}>
                          {(cellLabel: string): JSX.Element => {
                            const cell = createMemo(
                              (): HeatmapCell | undefined => {
                                return currentRow.cells.find((c) => {
                                  return c.label === cellLabel;
                                });
                              },
                            );

                            return (
                              <Show when={cell()} keyed>
                                {(currentCell: HeatmapCell): JSX.Element => {
                                  return (
                                    <div
                                      class={styles.heatmapCell}
                                      data-intensity={intensityBucket(
                                        currentCell.intensity,
                                      )}
                                      title={`${currentCell.label}: ${currentCell.text}`}
                                    >
                                      <span class={styles.flashOnChange}>
                                        {currentCell.text}
                                      </span>
                                    </div>
                                  );
                                }}
                              </Show>
                            );
                          }}
                        </For>
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

/** −1..1 intensity is bucketed into 7 discrete steps (-3..3) so colour comes
 * from a fixed CSS class per bucket (`data-intensity`) rather than a
 * per-cell inline style, which the repo's inline-style ESLint rule bans. */
function intensityBucket(intensity: number): string {
  const clamped = Math.max(-1, Math.min(1, intensity));
  return String(Math.round(clamped * 3));
}

// A named tag (rather than an inline `{ kind: "heatmap" }` literal) so
// `Extract<PanelData, ...>` never takes an inline object type argument (mirrors
// react's PanelHeatmap.tsx / JarvisMachine.ts's `ConfirmRequestTag`).
interface HeatmapKindTag {
  readonly kind: "heatmap";
}
export type PanelHeatmapProps = Extract<PanelData, HeatmapKindTag>;
type HeatmapRow = PanelHeatmapProps["rows"][number];
type HeatmapCell = HeatmapRow["cells"][number];
