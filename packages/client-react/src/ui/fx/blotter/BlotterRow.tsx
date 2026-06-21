import { useState } from "react";
import { TradeStatus, type Trade } from "@rtc/domain";
import { useHooks } from "../../hooks/HooksProvider";
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: highlight
          ? "rgba(59, 130, 246, 0.15)"
          : hovered
            ? "var(--bg-secondary)"
            : "transparent",
        transition: "background-color 1s ease-in-out",
        textDecoration: isRejected ? "line-through" : "none",
        color: isRejected ? "var(--accent-negative)" : "var(--text-primary)",
      }}
    >
      {COLUMNS.map((col) => (
        <td
          key={col.key}
          style={{
            padding: "4px 8px",
            fontSize: 12,
            borderBottom: "1px solid var(--border-subtle)",
            whiteSpace: "nowrap",
          }}
        >
          {formatCellValue(trade, col)}
        </td>
      ))}
    </tr>
  );
}
