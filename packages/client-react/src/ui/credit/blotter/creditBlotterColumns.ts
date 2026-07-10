import type { CreditTrade } from "@rtc/domain";

import type { ColumnDef } from "#/ui/fx/blotter/blotterColumns";

// rtc-original@4a31f01 client/src/apps/Credit/CoreCreditTrades/colConfig.ts:109-167 creditColDef
// Widths follow the FX blotter's convention (ColumnDef.width): fixed px for
// every column except the flexible last one, sized to this blotter's content
// (there is no credit grid in the prototype to copy verbatim).
export const CREDIT_COLUMNS: readonly ColumnDef<CreditTrade>[] = [
  { key: "tradeId", label: "Trade ID", filterType: "number", width: 76 },
  { key: "status", label: "Status", filterType: "set", width: 84 },
  { key: "tradeDate", label: "Trade Date", filterType: "date", width: 104 },
  { key: "direction", label: "Direction", filterType: "set", width: 80 },
  { key: "counterParty", label: "Counterparty", filterType: "set", width: 116 },
  { key: "cusip", label: "CUSIP", filterType: "set", width: 88 },
  { key: "security", label: "Security", filterType: "set", width: 118 },
  { key: "quantity", label: "Quantity", filterType: "number", width: 84 },
  { key: "orderType", label: "Order Type", filterType: "set", width: 84 },
  { key: "unitPrice", label: "Unit Price", filterType: "number" },
];

export const CREDIT_DESC_FIRST = new Set<keyof CreditTrade>([
  "tradeId",
  "tradeDate",
]);

export const CREDIT_CSV_UNFORMATTED = new Set<keyof CreditTrade>([
  "quantity",
  "unitPrice",
]);

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

export function formatCreditCell(
  row: CreditTrade,
  col: ColumnDef<CreditTrade>,
): string {
  switch (col.key) {
    case "status":
      return "Accepted";

    case "tradeDate": {
      const d = new Date(`${row.tradeDate}T00:00:00`);

      if (Number.isNaN(d.getTime())) {
        return row.tradeDate;
      }

      const day = String(d.getDate()).padStart(2, "0");
      return `${day}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
    }

    case "quantity":
      return row.quantity.toLocaleString("en-US", { maximumFractionDigits: 0 });
    case "unitPrice":
      return `$${row.unitPrice}`;
    default:
      return String(row[col.key]);
  }
}
