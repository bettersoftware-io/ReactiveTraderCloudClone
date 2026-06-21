import type { Trade } from "@rtc/domain";

export type FilterType = "set" | "number" | "date";

export interface ColumnDef {
  key: keyof Trade;
  label: string;
  filterType: FilterType;
}

export const COLUMNS: readonly ColumnDef[] = [
  { key: "tradeId", label: "Trade ID", filterType: "number" },
  { key: "status", label: "Status", filterType: "set" },
  { key: "tradeDate", label: "Trade Date", filterType: "date" },
  { key: "direction", label: "Direction", filterType: "set" },
  { key: "currencyPair", label: "CCYCCY", filterType: "set" },
  { key: "dealtCurrency", label: "Deal CCY", filterType: "set" },
  { key: "notional", label: "Notional", filterType: "number" },
  { key: "spotRate", label: "Rate", filterType: "number" },
  { key: "valueDate", label: "Value Date", filterType: "date" },
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
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatNotional(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatRate(rate: number): string {
  // 6 significant digits
  return rate.toPrecision(6);
}

export function formatCellValue(trade: Trade, col: ColumnDef): string {
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
