import type { Trade } from "@rtc/domain";

export type SortDirection = "asc" | "desc" | null;

export interface SortState {
  column: keyof Trade | null;
  direction: SortDirection;
}

// Date/ID columns: desc first. Text columns: asc first.
const numericOrDateColumns = new Set<keyof Trade>([
  "tradeId",
  "tradeDate",
  "valueDate",
  "notional",
  "spotRate",
]);

export function nextSortDirection(
  column: keyof Trade,
  current: SortState,
): SortState {
  if (current.column !== column) {
    // New column — first click
    const dir = numericOrDateColumns.has(column) ? "desc" : "asc";
    return { column, direction: dir };
  }

  // Same column — cycle
  if (current.direction === "desc") return { column, direction: "asc" };
  if (current.direction === "asc") return { column: null, direction: null };
  // null -> first click
  const dir = numericOrDateColumns.has(column) ? "desc" : "asc";
  return { column, direction: dir };
}

export function applySortToTrades(
  trades: readonly Trade[],
  sort: SortState,
): readonly Trade[] {
  if (!sort.column || !sort.direction) return trades;

  const col = sort.column;
  const dir = sort.direction === "asc" ? 1 : -1;

  return [...trades].sort((a, b) => {
    const va = a[col];
    const vb = b[col];

    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dir;
    }

    const sa = String(va).toLowerCase();
    const sb = String(vb).toLowerCase();
    return sa.localeCompare(sb) * dir;
  });
}
