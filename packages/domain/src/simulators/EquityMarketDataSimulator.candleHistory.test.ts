import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Candle } from "#/equities/candle.js";
import {
  CANDLE_HISTORY_DEPTH_MAX,
  CANDLE_HISTORY_PAGE,
  CANDLE_HISTORY_TOTAL,
} from "#/equities/timeframe.js";
import { EquityMarketDataSimulator } from "#/simulators/EquityMarketDataSimulator.js";

describe("EquityMarketDataSimulator.candleHistory", () => {
  it("returns a full chronological page strictly before beforeTime, on the bucket grid", async () => {
    const sim = new EquityMarketDataSimulator();
    const base = await baseSeries(sim);
    const oldest = base[0] as Candle;

    const p = await page(sim, oldest.time);

    expect(p).toHaveLength(CANDLE_HISTORY_PAGE);
    const newest = p[p.length - 1] as Candle;
    const bucketMs = (base[1] as Candle).time - oldest.time;
    expect(newest.time).toBe(oldest.time - bucketMs);

    for (let i = 1; i < p.length; i++) {
      expect((p[i] as Candle).time - (p[i - 1] as Candle).time).toBe(bucketMs);
    }
  });

  it("is deterministic: identical arguments yield identical candles, in any request order", async () => {
    const sim = new EquityMarketDataSimulator();
    const base = await baseSeries(sim);
    const oldest = (base[0] as Candle).time;

    const p1 = await page(sim, oldest);
    const deeper = await page(sim, (p1[0] as Candle).time);
    const p1again = await page(sim, oldest);

    expect(p1again).toEqual(p1);
    expect(deeper[deeper.length - 1] as Candle).not.toEqual(p1[0]);
  });

  it("chains page-to-page and page-to-base: closes are continuous across every seam", async () => {
    const sim = new EquityMarketDataSimulator();
    const base = await baseSeries(sim);
    const p1 = await page(sim, (base[0] as Candle).time);
    const p2 = await page(sim, (p1[0] as Candle).time);

    // Seam gaps stay within a normal inter-candle move (the walk is
    // continuous; only the sub-1% live-anchor drift and normal volatility
    // separate adjacent closes).
    function seamGap(a: Candle, b: Candle): number {
      return Math.abs(a.close - b.open) / a.close;
    }

    expect(
      seamGap(p1[p1.length - 1] as Candle, base[0] as Candle),
    ).toBeLessThan(0.05);
    expect(seamGap(p2[p2.length - 1] as Candle, p1[0] as Candle)).toBeLessThan(
      0.05,
    );
  });

  it("caps total depth at CANDLE_HISTORY_DEPTH_MAX: the last page is short, then empty", async () => {
    const sim = new EquityMarketDataSimulator();
    const base = await baseSeries(sim);
    let before = (base[0] as Candle).time;
    let fetched = 0;

    for (;;) {
      const p = await page(sim, before);
      fetched += p.length;

      if (p.length < CANDLE_HISTORY_PAGE) {
        break;
      }

      before = (p[0] as Candle).time;
    }

    expect(fetched).toBe(CANDLE_HISTORY_DEPTH_MAX - CANDLE_HISTORY_TOTAL);
    expect(await page(sim, before)).toEqual([]);
  });

  it("throws for an unknown symbol (same contract as candles())", async () => {
    const sim = new EquityMarketDataSimulator();

    await expect(
      firstValueFrom(sim.candleHistory("NOPE", "1D", 0, 10)),
    ).rejects.toThrow("Unknown symbol");
  });

  it("carries volume on every backfilled candle", async () => {
    const sim = new EquityMarketDataSimulator();
    const base = await baseSeries(sim);
    const p = await page(sim, (base[0] as Candle).time);

    for (const c of p) {
      expect(c.volume).toBeGreaterThan(0);
    }
  });
});

async function baseSeries(
  sim: EquityMarketDataSimulator,
): Promise<readonly Candle[]> {
  return await firstValueFrom(sim.candles("AAPL", "1D"));
}

async function page(
  sim: EquityMarketDataSimulator,
  beforeTime: number,
  count = CANDLE_HISTORY_PAGE,
): Promise<readonly Candle[]> {
  return await firstValueFrom(
    sim.candleHistory("AAPL", "1D", beforeTime, count),
  );
}
