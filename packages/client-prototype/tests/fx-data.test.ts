import { describe, expect, test } from "vitest";

import {
  BASE_RATES,
  fmtNum,
  META,
  ORDER,
  parseNotional,
  RFQ_THRESHOLD,
  SEED_TRADES,
  splitPrice,
} from "#/fx/fxData";
import { mulberry32 } from "#/mock/rng";

describe("fxData formatters", () => {
  test("parseNotional handles commas, k/m suffixes, and junk", () => {
    expect(parseNotional("1,000,000")).toBe(1_000_000);
    expect(parseNotional("2m")).toBe(2_000_000);
    expect(parseNotional("500k")).toBe(500_000);
    expect(Number.isNaN(parseNotional("abc"))).toBe(true);
    expect(Number.isNaN(parseNotional(null))).toBe(true);
  });

  test("fmtNum rounds and groups", () => {
    expect(fmtNum(1000000)).toBe("1,000,000");
    expect(fmtNum(1234.6)).toBe("1,235");
  });

  test("splitPrice splits a 5dp EURUSD quote into big/pips/frac", () => {
    expect(splitPrice(1.09213, META.EURUSD)).toEqual({
      big: "1.09",
      pips: "21",
      frac: "3",
    });
  });

  test("splitPrice splits a 3dp JPY quote", () => {
    // PROTO line 1149 `fmt()` slices `toFixed(d)` by raw character index, so
    // for bigLen === d (JPY pairs) the decimal point lands as the first
    // character of `pips`, not `big` — verified against the reference
    // prototype's own `fmt(rate,m)` output for this exact input.
    expect(splitPrice(151.203, META.USDJPY)).toEqual({
      big: "151",
      pips: ".2",
      frac: "03",
    });
  });

  test("ORDER has 8 pairs and META/BASE_RATES cover each", () => {
    expect(ORDER).toHaveLength(8);

    for (const sym of ORDER) {
      expect(META[sym]).toBeDefined();
      expect(BASE_RATES[sym]).toBeGreaterThan(0);
    }
  });

  test("SEED_TRADES has the 5 seeded rows with the RFQ threshold constant present", () => {
    expect(SEED_TRADES).toHaveLength(5);
    expect(SEED_TRADES[0].id).toBe(1042);
    expect(RFQ_THRESHOLD).toBe(10_000_000);
  });

  test("mulberry32 is deterministic for a fixed seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBeGreaterThanOrEqual(0);
    expect(a()).toBeLessThan(1);
  });
});
