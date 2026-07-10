import { describe, expect, it } from "vitest";

import { loadGolden } from "../__testUtils__/loadGolden.js";
import { aggregateCandle, gbmStep, mulberry32 } from "./gbm.js";

describe("equities GBM + candle helpers (golden)", () => {
  const g = loadGolden<never>(
    "equitiesGbm",
    import.meta.url,
  ) as unknown as Golden;

  it.each(g.gbm)("gbmStep(price=$price, rand=$rand) -> $expected", ({
    price,
    rand,
    vol,
    expected,
  }) => {
    expect(gbmStep(price, rand, vol)).toBeCloseTo(expected, 6);
  });

  it("mulberry32(42) is deterministic for the first 3 draws", () => {
    const rng = mulberry32(42);
    const got = [rng(), rng(), rng()];

    for (let i = 0; i < 3; i++) {
      expect(got[i]).toBeCloseTo(g.mulberry32Seed42First3[i] ?? Number.NaN, 12);
    }
  });

  it("aggregateCandle folds a price series into one OHLC bar", () => {
    let candle = null as ReturnType<typeof aggregateCandle> | null;

    for (const p of g.candle.prices) {
      candle = aggregateCandle(candle, p, g.candle.time0, g.candle.bucketMs);
    }

    expect(candle).toEqual(g.candle.expected);
  });
});

interface GbmCase {
  price: number;
  rand: number;
  vol: number;
  expected: number;
}

interface Golden {
  _source: string;
  gbm: GbmCase[];
  mulberry32Seed42First3: number[];
  candle: {
    prices: number[];
    time0: number;
    bucketMs: number;
    expected: {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
    };
  };
}
