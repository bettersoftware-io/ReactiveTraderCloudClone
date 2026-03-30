export type CurrencyCategory = "All" | "EUR" | "USD" | "GBP" | "AUD" | "NZD" | "JPY" | "CAD";

export const CURRENCY_CATEGORIES: readonly CurrencyCategory[] = [
  "All", "EUR", "USD", "GBP", "AUD", "NZD", "JPY", "CAD",
] as const;

/**
 * A pair matches a filter if its 6-character symbol contains
 * the 3-character currency code anywhere in the string.
 */
export function matchesCurrencyFilter(symbol: string, filter: CurrencyCategory): boolean {
  if (filter === "All") return true;
  return symbol.includes(filter);
}
