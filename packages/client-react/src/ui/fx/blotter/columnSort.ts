import type { Trade } from "@rtc/domain";

type SortDirection = "asc" | "desc" | null;

export interface SortState<TRow = Trade> {
  column: keyof TRow | null;
  direction: SortDirection;
}

// Desc-first columns, verbatim from rtc-original@4a31f01
// App/Trades/TradesState/sortState.ts:32 `descDefaultFields`.
// Every other column (incl. notional, spotRate) sorts ASC on first click.
export const FX_DESC_FIRST = new Set<keyof Trade>([
  "tradeId",
  "tradeDate",
  "valueDate",
]);

/**
 * Generic sort-direction cycle for any row type.
 * descFirst: columns that sort DESC on first click.
 */
export function nextSortDirection<TRow>(
  column: keyof TRow,
  current: SortState<TRow>,
  descFirst: ReadonlySet<keyof TRow>,
): SortState<TRow>;
/**
 * FX overload (2-arg) — uses FX_DESC_FIRST automatically.
 * Preserved for backward compat with T1.1 callers.
 */
export function nextSortDirection(
  column: keyof Trade,
  current: SortState<Trade>,
): SortState<Trade>;
export function nextSortDirection<TRow>(
  column: keyof TRow,
  current: SortState<TRow>,
  descFirst: ReadonlySet<keyof TRow> = FX_DESC_FIRST as unknown as ReadonlySet<keyof TRow>,
): SortState<TRow> {
  if (current.column !== column) {
    // New column — first click
    const dir = descFirst.has(column) ? "desc" : "asc";
    return { column, direction: dir };
  }

  // Same column — cycle (mirrors original sortState.ts:46-63):
  // desc-first: DESC → ASC → none; asc-first: ASC → DESC → none.
  const isDescFirst = descFirst.has(column);
  if (isDescFirst && current.direction === "desc")
    return { column, direction: "asc" };
  if (!isDescFirst && current.direction === "asc")
    return { column, direction: "desc" };
  if (current.direction !== null) return { column: null, direction: null };
  // null -> first click
  const dir = isDescFirst ? "desc" : "asc";
  return { column, direction: dir };
}

/** Generic sort for any row type. */
export function applySort<TRow>(
  rows: readonly TRow[],
  sort: SortState<TRow>,
): readonly TRow[] {
  if (!sort.column || !sort.direction) return rows;

  const col = sort.column;
  const dir = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
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

/** FX-bound wrapper — kept for backward compat. */
export function applySortToTrades(
  trades: readonly Trade[],
  sort: SortState<Trade>,
): readonly Trade[] {
  return applySort(trades, sort);
}
