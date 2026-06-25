import type { ReactElement } from "react";
import { useState } from "react";

import { TradeStatus } from "@rtc/domain";

import { useHooks } from "#/ui/hooks/useHooks";

import type { CellFormatter, ColumnDef } from "./blotterColumns";

import styles from "./BlotterRow.module.css";

interface BlotterRowProps<TRow> {
  trade: TRow;
  isNew: boolean;
  columns: readonly ColumnDef<TRow>[];
  format: CellFormatter<TRow>;
}

export function BlotterRow<TRow extends { status: string }>({
  trade,
  isNew,
  columns,
  format,
}: BlotterRowProps<TRow>): ReactElement {
  // The transient new-row highlight (true for HIGHLIGHT_MS then false) now lives
  // in the app-layer createRowHighlightMachine behind the seam, so this row holds
  // no timer. Hover stays here — it's pure interaction view state, no timer.
  const highlight = useHooks().useRowHighlight(isNew);
  const [hovered, setHovered] = useState(false);
  const isRejected = trade.status === TradeStatus.Rejected;

  return (
    <tr
      data-state={isRejected ? "rejected" : "live"}
      data-highlight={highlight ? "true" : undefined}
      data-hovered={hovered ? "true" : undefined}
      onMouseEnter={() => {
        return setHovered(true);
      }}
      onMouseLeave={() => {
        return setHovered(false);
      }}
      className={styles.row}
    >
      {columns.map((col) => {
        return (
          <td key={String(col.key)} className={styles.cell}>
            {format(trade, col)}
          </td>
        );
      })}
    </tr>
  );
}
