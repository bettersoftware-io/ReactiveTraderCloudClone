import type { Trade } from "@rtc/domain";

import type { CellFormatter, ColumnDef } from "./blotterColumns";
import { COLUMNS, formatFxCell } from "./blotterColumns";

/** Generic CSV export. Columns with keys in unformatted get String(row[key]) directly.
 *  `filename` is the download's suggested name — each blotter passes its own
 *  (PROTO useFxBlotter/useCreditRfqs export distinct per-blotter filenames). */
export function exportToCsv<TRow>(
  rows: readonly TRow[],
  columns: readonly ColumnDef<TRow>[],
  format: CellFormatter<TRow>,
  filename: string,
  unformatted?: ReadonlySet<keyof TRow>,
): void {
  const headers = columns.map((c) => {
    return c.label;
  });
  const csvRows = rows.map((row) => {
    return columns.map((col) => {
      if (unformatted?.has(col.key)) {
        return String(row[col.key]);
      }

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
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** FX-bound convenience — used by FxBlotter. */
export function exportFxToCsv(trades: readonly Trade[]): void {
  exportToCsv(
    trades,
    COLUMNS,
    formatFxCell,
    FX_EXPORT_FILENAME,
    new Set<keyof Trade>(["notional"]),
  );
}

// PROTO useFxBlotter.ts EXPORT_FILENAME.
const FX_EXPORT_FILENAME = "fx-trades.csv";
