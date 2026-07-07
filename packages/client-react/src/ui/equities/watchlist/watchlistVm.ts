import type { EqWatchlistSort } from "@rtc/domain";

/**
 * One watchlist row's sortable fields. `last`/`changePct` are `null` until the
 * first quote arrives for that symbol (mirrors `useEquityQuote`'s pre-tick
 * state) — unquoted rows sort last regardless of mode.
 *
 * Unlike the prototype's `watchlistVm` (a single pure function fed by one
 * `useEquities` state bag), this app's quotes arrive per-symbol via
 * `useEquityQuote(symbol)` inside each row — so only the SORT is pure/portable
 * here; row content stays owned by WatchlistRow.
 */
export interface WatchlistRowInput {
  readonly symbol: string;
  readonly name: string;
  readonly last: number | null;
  readonly changePct: number | null;
}

/** Sort rows by the active mode: "sym" (A–Z), "chg" (% change desc), or
 * "price" (last desc). Stable — ties keep their input order. Pure so it's
 * unit-testable without mounting anything. */
export function sortWatchlistRows(
  rows: readonly WatchlistRowInput[],
  sort: EqWatchlistSort,
): readonly WatchlistRowInput[] {
  if (sort === "sym") {
    return [...rows].sort((a, b) => {
      return a.symbol.localeCompare(b.symbol);
    });
  }

  if (sort === "chg") {
    return [...rows].sort((a, b) => {
      return (
        (b.changePct ?? Number.NEGATIVE_INFINITY) -
        (a.changePct ?? Number.NEGATIVE_INFINITY)
      );
    });
  }

  return [...rows].sort((a, b) => {
    return (
      (b.last ?? Number.NEGATIVE_INFINITY) -
      (a.last ?? Number.NEGATIVE_INFINITY)
    );
  });
}
