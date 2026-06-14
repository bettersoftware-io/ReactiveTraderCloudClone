import { describe, it, expect } from "vitest";
import { deriveBaseTerm, KNOWN_CURRENCY_PAIRS } from "./currencyPair.js";

describe("deriveBaseTerm", () => {
  it("splits a 6-letter symbol into its base and terms currencies", () => {
    expect(deriveBaseTerm("EURUSD")).toEqual({ base: "EUR", terms: "USD" });
    expect(deriveBaseTerm("GBPJPY")).toEqual({ base: "GBP", terms: "JPY" });
  });
});

describe("KNOWN_CURRENCY_PAIRS", () => {
  it("every pair's symbol is the concatenation of its base and terms", () => {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      expect(pair.symbol).toBe(`${pair.base}${pair.terms}`);
      expect(deriveBaseTerm(pair.symbol)).toEqual({ base: pair.base, terms: pair.terms });
    }
  });

  it("every pair declares a positive rate precision, pips position, and default notional", () => {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      expect(pair.ratePrecision).toBeGreaterThan(0);
      expect(pair.pipsPosition).toBeGreaterThan(0);
      expect(pair.defaultNotional).toBeGreaterThan(0);
    }
  });
});
