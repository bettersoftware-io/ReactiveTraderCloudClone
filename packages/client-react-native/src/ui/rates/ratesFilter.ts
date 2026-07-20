import type { CurrencyPair } from "@rtc/domain";

export const RATE_FILTERS = ["ALL", "EUR", "USD", "GBP", "JPY", "AUD"] as const;

export type RateFilter = (typeof RATE_FILTERS)[number];

/** Prototype filter: ALL passes through; otherwise keep pairs whose symbol
 * contains the currency substring (`dc.html` L2452: `p.sym.includes(filter)`). */
export function filterPairs(
  pairs: readonly CurrencyPair[],
  filter: RateFilter,
): readonly CurrencyPair[] {
  if (filter === "ALL") {
    return pairs;
  }

  return pairs.filter((p) => {
    return p.symbol.includes(filter);
  });
}
