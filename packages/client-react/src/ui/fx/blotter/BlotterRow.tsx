import { type Trade, TradeStatus } from "@rtc/domain";
import { useState } from "react";
import { useHooks } from "../../hooks/HooksProvider";
import styles from "./BlotterRow.module.css";
import { COLUMNS, formatCellValue } from "./blotterColumns";

interface BlotterRowProps {
  trade: Trade;
  isNew: boolean;
}

export function BlotterRow({ trade, isNew }: BlotterRowProps) {
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={styles.row}
    >
      {COLUMNS.map((col) => (
        <td key={col.key} className={styles.cell}>
          {formatCellValue(trade, col)}
        </td>
      ))}
    </tr>
  );
}
