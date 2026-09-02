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
  // props.isNew seeds useRowHighlight's own decay machine exactly once, by
  // design (see the doc comment above): the transient highlight (true for
  // HIGHLIGHT_MS then false) is owned entirely by that machine's internal
  // timer, not synced to future prop changes — so this is a one-time seed,
  // not a value this row needs to track live, regardless of whether
  // FxBlotter's <For each={processedTrades()}> happens to remount this row.
  // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
  const highlight = useRowHighlight(props.isNew);
  const [hovered, setHovered] = createSignal(false);

  function hoverRow(): void {
    setHovered(true);
  }

  function unhoverRow(): void {
    setHovered(false);
  }

  return (
    <tr
      data-state={
        props.trade.status === TradeStatus.Rejected ? "rejected" : "live"
      }
      data-status={props.trade.status.toLowerCase()}
      data-highlight={highlight() ? "true" : undefined}
      data-hovered={hovered() ? "true" : undefined}
      onMouseEnter={hoverRow}
      onMouseLeave={unhoverRow}
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
