import { describe, expect, it } from "vitest";

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
      expect(deriveBaseTerm(pair.symbol)).toEqual({
        base: pair.base,
        terms: pair.terms,
      });
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

const EXPECTED_BASE_MIDS: Record<string, number> = {
  EURUSD: 1.09213,
  USDJPY: 151.203,
  GBPUSD: 1.26414,
  GBPJPY: 191.085,
  EURJPY: 165.142,
  AUDUSD: 0.66121,
  NZDUSD: 0.61054,
  EURCAD: 1.49385,
  EURAUD: 1.65172,
};

const EXPECTED_SPREAD_PIPS: Record<string, number> = {
  EURUSD: 1.4,
  USDJPY: 1.6,
  GBPUSD: 1.8,
  GBPJPY: 2.6,
  EURJPY: 2.1,
  AUDUSD: 2.0,
  NZDUSD: 2.4,
  EURCAD: 2.2,
  EURAUD: 2.0,
};

describe("KNOWN_CURRENCY_PAIRS realism metadata", () => {
  it("every pair carries the PROTO base mid", () => {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      expect(pair.baseMid, pair.symbol).toBe(EXPECTED_BASE_MIDS[pair.symbol]);
    }
  });

  it("every pair carries the PROTO typical spread in pips", () => {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      expect(pair.typicalSpreadPips, pair.symbol).toBe(
        EXPECTED_SPREAD_PIPS[pair.symbol],
      );
    }
  });

  it("base mids are consistent with rate precision", () => {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      expect(Number(pair.baseMid.toFixed(pair.ratePrecision))).toBe(
        pair.baseMid,
      );
    }
  });
});
