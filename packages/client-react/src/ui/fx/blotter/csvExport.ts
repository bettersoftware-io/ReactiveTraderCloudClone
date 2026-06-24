import type { Trade } from "@rtc/domain";

import { COLUMNS, formatFxCell } from "./blotterColumns";
import type { CellFormatter, ColumnDef } from "./blotterColumns";

/** Generic CSV export. Columns with keys in unformatted get String(row[key]) directly. */
export function exportToCsv<TRow>(
  rows: readonly TRow[],
  columns: readonly ColumnDef<TRow>[],
  format: CellFormatter<TRow>,
  unformatted?: ReadonlySet<keyof TRow>,
): void {
  const headers = columns.map((c) => {
    return c.label;
  });
  const csvRows = rows.map((row) => {
    return columns.map((col) => {
      if (unformatted?.has(col.key)) return String(row[col.key]);
      return format(row, col);
    });
  });

  const csvContent = [
    headers.join(","),
    ...csvRows.map((row) => {
      return row
        .map((cell) => {
          return cell.includes(",") ? `"${cell}"` : cell;
        })
        .join(",");
    }),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "RT-Blotter.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** FX-bound convenience — used by FxBlotter. */
export function exportFxToCsv(trades: readonly Trade[]): void {
  exportToCsv(
    trades,
    COLUMNS,
    formatFxCell,
    new Set<keyof Trade>(["notional"]),
  );
}
