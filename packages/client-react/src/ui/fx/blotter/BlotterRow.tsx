import { useState } from "react";
import { TradeStatus, type Trade } from "@rtc/domain";
import { useHooks } from "../../hooks/HooksProvider";
import { COLUMNS, formatCellValue } from "./blotterColumns";
import styles from "./BlotterRow.module.css";

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

  const backgroundColor = highlight
    ? "rgba(59, 130, 246, 0.15)"
    : hovered
      ? "var(--bg-secondary)"
      : "transparent";

  return (
    <tr
      data-state={isRejected ? "rejected" : "live"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={styles.row}
      style={{ backgroundColor }}
    >
      {COLUMNS.map((col) => (
        <td
          key={col.key}
          className={styles.cell}
        >
          {formatCellValue(trade, col)}
        </td>
      ))}
    </tr>
  );
}
