import type { JSX } from "solid-js";
import { createSignal, For } from "solid-js";

import { TradeStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import type { CellFormatter, ColumnDef } from "./blotterColumns";

import styles from "./BlotterRow.module.css";

export function BlotterRow<TRow extends { status: string }>(
  props: BlotterRowProps<TRow>,
): JSX.Element {
  // The transient new-row highlight (true for HIGHLIGHT_MS then false) now lives
  // in the app-layer createRowHighlightMachine behind the seam, so this row holds
  // no timer. Hover stays here — it's pure interaction view state, no timer.
  const { useRowHighlight } = useViewModel();
  const highlight = useRowHighlight(props.isNew);
  const [hovered, setHovered] = createSignal(false);

  return (
    <tr
      data-state={
        props.trade.status === TradeStatus.Rejected ? "rejected" : "live"
      }
      data-status={props.trade.status.toLowerCase()}
      data-highlight={highlight() ? "true" : undefined}
      data-hovered={hovered() ? "true" : undefined}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      class={styles.row}
    >
      <For each={props.columns}>
        {(col: ColumnDef<TRow>) => {
          return <td class={styles.cell}>{props.format(props.trade, col)}</td>;
        }}
      </For>
    </tr>
  );
}

interface BlotterRowProps<TRow> {
  trade: TRow;
  isNew: boolean;
  columns: readonly ColumnDef<TRow>[];
  format: CellFormatter<TRow>;
}
