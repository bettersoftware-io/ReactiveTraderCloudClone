import type { Trade } from "@rtc/domain";
import { COLUMNS, formatCellValue } from "./blotterColumns";

export function exportToCsv(trades: readonly Trade[]): void {
  const headers = COLUMNS.map((c) => c.label);
  const rows = trades.map((trade) =>
    COLUMNS.map((col) => {
      // Notional: unformatted integer for CSV
      if (col.key === "notional") return String(trade.notional);
      return formatCellValue(trade, col);
    }),
  );

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => (cell.includes(",") ? `"${cell}"` : cell)).join(","),
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "RT-Blotter.csv";
  link.click();
  URL.revokeObjectURL(url);
}
