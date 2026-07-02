import { describe, expect, test } from "vitest";

import {
  EQ_META,
  EQ_SYMS,
  genCandles,
  seedVols,
} from "#/equities/equitiesData";
import { mulberry32 } from "#/mock/rng";

describe("equitiesData", () => {
  test("EQ_META has 8 symbols with AAPL first at 229.35", () => {
    expect(EQ_SYMS).toHaveLength(8);
    expect(EQ_SYMS[0]).toBe("AAPL");
    expect(EQ_META.AAPL.px).toBe(229.35);
    expect(EQ_META.SPY.exch).toBe("NYSE ARCA");
  });

  test("genCandles is deterministic under a seeded rng and honours bar counts", () => {
    const a = genCandles("AAPL", "1D", mulberry32(7));
    const b = genCandles("AAPL", "1D", mulberry32(7));
    expect(a).toHaveLength(40);
    expect(genCandles("AAPL", "3M", mulberry32(7))).toHaveLength(52);
    expect(a).toEqual(b);

    for (const candle of a) {
      expect(candle.h).toBeGreaterThanOrEqual(Math.max(candle.o, candle.c));
      expect(candle.l).toBeLessThanOrEqual(Math.min(candle.o, candle.c));
    }
  });

  test("seedVols yields one stable M-suffixed string per symbol", () => {
    const vols = seedVols(mulberry32(1));
    expect(Object.keys(vols)).toHaveLength(8);
    expect(vols.AAPL).toMatch(/^\d\.\dM$/);
  });
});
