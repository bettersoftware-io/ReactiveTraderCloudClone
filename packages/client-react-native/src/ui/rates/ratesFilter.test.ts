import { describe, expect, it } from "vitest";

import type { CurrencyPair } from "@rtc/domain";

import { filterPairs, RATE_FILTERS } from "./ratesFilter";

function pair(symbol: string): CurrencyPair {
  return { symbol, ratePrecision: 5, pipsPosition: 4, base: symbol.slice(0, 3), terms: symbol.slice(3), defaultNotional: 1_000_000, baseMid: 1, typicalSpreadPips: 1 };
}

const pairs = [pair("EURUSD"), pair("USDJPY"), pair("GBPUSD"), pair("EURJPY")];

describe("filterPairs", () => {
  it("returns all pairs for ALL", () => {
    expect(filterPairs(pairs, "ALL")).toHaveLength(4);
  });

  it("matches the substring anywhere in the symbol", () => {
    expect(filterPairs(pairs, "JPY").map((p) => p.symbol)).toEqual(["USDJPY", "EURJPY"]);
    expect(filterPairs(pairs, "EUR").map((p) => p.symbol)).toEqual(["EURUSD", "EURJPY"]);
  });

  it("exposes the prototype filter set in order", () => {
    expect(RATE_FILTERS).toEqual(["ALL", "EUR", "USD", "GBP", "JPY", "AUD"]);
  });
});
