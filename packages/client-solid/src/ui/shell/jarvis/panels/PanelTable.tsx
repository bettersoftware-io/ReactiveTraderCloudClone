import type { JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import type { PanelData } from "@rtc/client-core";

import styles from "./panels.module.css";

/** Dumb tone-coloured data table. Pure props-in, paint-out.
 *
 * Rows are addressed by CONTENT (`JSON.stringify(row.cells)`, same formula
 * as react's `PanelTable.tsx`), not object identity — `props.rows` is a
 * freshly-mapped array on every tick, so keying `<For>` by that content
 * string (via the id-then-lookup pattern shared with `CreditBlotter.tsx` /
 * `RfqsPanel.tsx`) reuses a row's DOM for an unchanged row and remounts it
 * (retriggering `.flashOnChange` on its cells, the Solid analogue of React's
 * `key`-based remount) only when its cell values genuinely differ. */
export function PanelTable(props: PanelTableProps): JSX.Element {
  const rowKeys = createMemo((): string[] => {
    return props.rows.map((row) => {
      return JSON.stringify(row.cells);
    });
  });

  return (
    <Show
      when={props.rows.length > 0}
      fallback={<div class={styles.empty}>No data yet</div>}
    >
      <table data-testid="jarvis-panel-table" class={styles.table}>
        <thead>
          <tr>
            <For each={props.columns}>
              {(col: string): JSX.Element => {
                return <th class={styles.tableHead}>{col}</th>;
              }}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={rowKeys()}>
            {(rowKey: string): JSX.Element => {
              const row = createMemo((): TableRow | undefined => {
                return props.rows.find((r) => {
                  return JSON.stringify(r.cells) === rowKey;
                });
              });

              return (
                <Show when={row()} keyed>
                  {(currentRow: TableRow): JSX.Element => {
                    return (
                      <tr data-tone={currentRow.tone} class={styles.tableRow}>
                        <For each={currentRow.cells}>
                          {(cell: string): JSX.Element => {
                            return (
                              <td class={styles.tableCell}>
                                <span class={styles.flashOnChange}>{cell}</span>
                              </td>
                            );
                          }}
                        </For>
                      </tr>
                    );
                  }}
                </Show>
              );
            }}
          </For>
        </tbody>
      </table>
    </Show>
  );
}

// A named tag (rather than an inline `{ kind: "table" }` literal) so
// `Extract<PanelData, ...>` never takes an inline object type argument (mirrors
// react's PanelTable.tsx / JarvisMachine.ts's `ConfirmRequestTag`).
interface TableKindTag {
  readonly kind: "table";
}
export type PanelTableProps = Extract<PanelData, TableKindTag>;
type TableRow = PanelTableProps["rows"][number];
