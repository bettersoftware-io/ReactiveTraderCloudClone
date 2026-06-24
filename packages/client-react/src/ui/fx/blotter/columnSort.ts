import type { Trade } from "@rtc/domain";

type SortDirection = "asc" | "desc" | null;

export interface SortState {
  column: keyof Trade | null;
  direction: SortDirection;
}

// Desc-first columns, verbatim from rtc-original@4a31f01
// App/Trades/TradesState/sortState.ts:32 `descDefaultFields`.
// Every other column (incl. notional, spotRate) sorts ASC on first click.
const descFirstColumns = new Set<keyof Trade>([
  "tradeId",
  "tradeDate",
  "valueDate",
]);

export function nextSortDirection(
  column: keyof Trade,
  current: SortState,
): SortState {
  if (current.column !== column) {
    // New column — first click
    const dir = descFirstColumns.has(column) ? "desc" : "asc";
    return { column, direction: dir };
  }

  // Same column — cycle (mirrors original sortState.ts:46-63):
  // desc-first: DESC → ASC → none; asc-first: ASC → DESC → none.
  const isDescFirst = descFirstColumns.has(column);
  if (isDescFirst && current.direction === "desc")
    return { column, direction: "asc" };
  if (!isDescFirst && current.direction === "asc")
    return { column, direction: "desc" };
  if (current.direction !== null) return { column: null, direction: null };
  // null -> first click
  const dir = isDescFirst ? "desc" : "asc";
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
