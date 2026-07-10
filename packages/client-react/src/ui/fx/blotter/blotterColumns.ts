import type { Trade } from "@rtc/domain";

type FilterType = "set" | "number" | "date";

export interface ColumnDef<TRow> {
  key: keyof TRow;
  label: string;
  filterType: FilterType;
  /** Fixed px column width, rendered through BlotterColgroup in BOTH the
   * header table and the scrolling rows table (table-layout: fixed) so the
   * two regions' column edges align exactly. Omit on (at most) the LAST
   * column to leave it flexible — it absorbs the rows region's vertical
   * scrollbar width so the fixed edges never shift between the regions. */
  width?: number;
}

export type CellFormatter<TRow> = (row: TRow, col: ColumnDef<TRow>) => string;

// Widths: PROTO Blotter/TradesBlotter.module.css .headerRow
// grid-template-columns (84 92 118 80 92 72 116 92 106 84), with the final
// Trader column left flexible instead of the prototype's fixed 84px (see
// ColumnDef.width above).
export const COLUMNS: readonly ColumnDef<Trade>[] = [
  { key: "tradeId", label: "Trade ID", filterType: "number", width: 84 },
  { key: "status", label: "Status", filterType: "set", width: 92 },
  { key: "tradeDate", label: "Trade Date", filterType: "date", width: 118 },
  { key: "direction", label: "Direction", filterType: "set", width: 80 },
  { key: "currencyPair", label: "CCYCCY", filterType: "set", width: 92 },
  { key: "dealtCurrency", label: "Deal CCY", filterType: "set", width: 72 },
  { key: "notional", label: "Notional", filterType: "number", width: 116 },
  { key: "spotRate", label: "Rate", filterType: "number", width: 92 },
  { key: "valueDate", label: "Value Date", filterType: "date", width: 106 },
  { key: "tradeName", label: "Trader", filterType: "set" },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDate(dateStr: string): string {
  // dateStr is ISO date string like "2026-03-30"
  const d = new Date(`${dateStr}T00:00:00`);

  if (Number.isNaN(d.getTime())) {
    return dateStr;
  }

  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/** Exported so other FX blotter views (e.g. ActivityView) render notionals
 * identically to the table's Notional column, instead of reimplementing the
 * same `toLocaleString` formatting. */
export function formatNotional(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Exported so other FX blotter views (e.g. ActivityView) render rates
 * identically to the table's Rate column. */
export function formatRate(rate: number): string {
  // 6 significant digits
  return rate.toPrecision(6);
}

export function formatFxCell(trade: Trade, col: ColumnDef<Trade>): string {
  const value = trade[col.key];

  switch (col.key) {
    case "tradeDate":
    case "valueDate":
      return formatDate(String(value));
    case "notional":
      return formatNotional(value as number);
    case "spotRate":
      return formatRate(value as number);
    default:
      return String(value);
  }
}
