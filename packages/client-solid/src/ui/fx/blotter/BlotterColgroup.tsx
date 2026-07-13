import type { JSX } from "solid-js";
import { For } from "solid-js";

import type { ColumnDef } from "./blotterColumns";

import styles from "./BlotterColgroup.module.css";

/**
 * Shared `<colgroup>` for a split blotter: the static header table and the
 * scrolling rows table each render this with the SAME column defs, so under
 * `table-layout: fixed` their column edges land on identical px offsets even
 * though they are two separate tables. Columns without a `width` (at most
 * the last one) stay flexible and absorb the width difference the rows
 * region's vertical scrollbar introduces — the fixed edges never shift.
 */
export function BlotterColgroup<TRow>(
  props: BlotterColgroupProps<TRow>,
): JSX.Element {
  return (
    <colgroup>
      <For each={props.columns}>
        {(col: ColumnDef<TRow>) => {
          return (
            <col
              class={styles.col}
              // eslint-disable-next-line no-restricted-syntax -- runtime per-column width via CSS custom property; static CSS can't express data-driven widths
              style={{ "--blotter-col-width": colWidth(col) }}
            />
          );
        }}
      </For>
    </colgroup>
  );
}

interface BlotterColgroupProps<TRow> {
  columns: readonly ColumnDef<TRow>[];
}

function colWidth<TRow>(col: ColumnDef<TRow>): string {
  return col.width === undefined ? "auto" : `${col.width}px`;
}
