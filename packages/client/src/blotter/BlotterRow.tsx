import { useEffect, useState } from "react";
import { TradeStatus, type Trade } from "@rtc/domain";
import { COLUMNS, formatCellValue } from "./blotterColumns";

interface BlotterRowProps {
  trade: Trade;
  isNew: boolean;
}

export function BlotterRow({ trade, isNew }: BlotterRowProps) {
  const [highlight, setHighlight] = useState(isNew);
  const [hovered, setHovered] = useState(false);
  const isRejected = trade.status === TradeStatus.Rejected;

  useEffect(() => {
    if (!isNew) return;
    setHighlight(true);
    const timer = setTimeout(() => setHighlight(false), 3000);
    return () => clearTimeout(timer);
  }, [isNew]);

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
