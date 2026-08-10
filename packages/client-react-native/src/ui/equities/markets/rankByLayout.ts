import type { EqWatchlistSort } from "@rtc/domain";

/** The `RANK BY` row's chip order (design mobile-v1 markets sheet) is `%
 * CHG`, `PRICE`, `A–Z` — which is **not** `EQ_WATCHLIST_SORTS`' own order
 * (the watchlist head's cycle order: sym, chg, price). This is a VIEW
 * ordering only; the domain order still governs storage and every other
 * consumer. Mirrors `SKIN_DISPLAY_ORDER` in
 * `#/ui/shell/appearance/appearanceLayout.ts` — split into its own module for
 * the same reason that one is: a component file may only export components
 * (`useComponentExportOnlyModules`), so a plain data constant living
 * alongside `RankByChips` would fail that gate. `rankByLayout.test.ts` guards
 * this list with a permutation test against `EQ_WATCHLIST_SORTS`, so a sort
 * silently dropped from the row cannot go unnoticed. */
export const RANK_DISPLAY_ORDER: readonly EqWatchlistSort[] = [
  "chg",
  "price",
  "sym",
];
