import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";

describe("EquityMarketDataSimulator :: timeframe-parameterised candles", () => {
  it("defaults to '1D' — the omitted-arg call is byte-identical to an explicit '1D'", async () => {
    const port = new EquityMarketDataSimulator(42);
    const noArg = await firstValueFrom(port.candles("AAPL"));
    const explicit = await firstValueFrom(port.candles("AAPL"));
    // Two independent calls with the same (default) timeframe are
    // deterministic — same seed, same bucket grid at ~same `now`.
    expect(noArg).toEqual(explicit);
    expect(noArg).toHaveLength(60);
  });

  it.each([
    ["1W", 44] as const,
    ["1M", 48] as const,
    ["3M", 52] as const,
  ])("'%s' returns %i candles with high >= low for every bar", async (tf, count) => {
    const port = new EquityMarketDataSimulator(42);
    const candles = await firstValueFrom(port.candles("AAPL", tf));
    expect(candles).toHaveLength(count);

    for (const c of candles) {
      expect(c.high).toBeGreaterThanOrEqual(c.low);
    }
  });

  it("produces a monotonically increasing `time` series ending near now, for every timeframe", async () => {
    const port = new EquityMarketDataSimulator(42);
    // The last bucket is floored to its own boundary, so it can trail `now`
    // by up to one bucket — bound generously (a bucket is at most ~90d/52).
    const maxBucketMs = Math.ceil((90 * 24 * 60 * 60 * 1000) / 52);

    for (const tf of ["1D", "1W", "1M", "3M"] as const) {
      const now = Date.now();
      const candles = await firstValueFrom(port.candles("AAPL", tf));

      for (let i = 1; i < candles.length; i++) {
        expect(candles[i]?.time).toBeGreaterThan(
          candles[i - 1]?.time ?? -Infinity,
        );
      }

      const last = candles.at(-1);
      expect(last?.time).toBeLessThanOrEqual(now);
      expect(last?.time).toBeGreaterThanOrEqual(now - maxBucketMs);
    }
  });

  it("uses a distinct deterministic seed per timeframe — series differ across timeframes for the same symbol", async () => {
    const port = new EquityMarketDataSimulator(42);
    const oneDay = await firstValueFrom(port.candles("AAPL", "1D"));
    const oneWeek = await firstValueFrom(port.candles("AAPL", "1W"));
    const oneMonth = await firstValueFrom(port.candles("AAPL", "1M"));
    const threeMonths = await firstValueFrom(port.candles("AAPL", "3M"));
    // Different bucket counts already prove they're distinct series, but also
    // assert the underlying close-price paths diverge (not just lengths).
    expect(
      oneDay.map((c) => {
        return c.close;
      }),
    ).not.toEqual(
      oneWeek.map((c) => {
        return c.close;
      }),
    );
    expect(
      oneWeek.map((c) => {
        return c.close;
      }),
    ).not.toEqual(
      oneMonth.map((c) => {
        return c.close;
      }),
    );
    expect(
      oneMonth.map((c) => {
        return c.close;
      }),
    ).not.toEqual(
      threeMonths.map((c) => {
        return c.close;
      }),
    );
  });

  it.each([
    "1D",
    "1W",
    "1M",
    "3M",
  ] as const)("'%s' generates real OHLC bodies — not every bar is a degenerate doji (I1 regression)", async (tf) => {
    // Before the fix, candles() drew exactly ONE GBM sample per bucket, so
    // every bar had open===high===low===close (a flat doji, zero-length
    // wick) — the "candlestick chart" was a scatter of dashes.
    const port = new EquityMarketDataSimulator(42);
    const candles = await firstValueFrom(port.candles("AAPL", tf));

    const hasRealBody = candles.some((c) => {
      return c.open !== c.close;
    });

    const hasRealWick = candles.some((c) => {
      return c.high > c.low;
    });

    expect(hasRealBody).toBe(true);
    expect(hasRealWick).toBe(true);
  });

  it.each([
    "1D",
    "1W",
    "1M",
    "3M",
  ] as const)("'%s' anchors the last candle's close to the CURRENT live price, not an independent frozen walk (I1 regression)", async (tf) => {
    // Before the fix, the candle walk (fresh mulberry32(seed) from s.open)
    // and the live quote walk (a per-symbol RNG evolving since
    // construction) were unrelated — chartVm's live-overlay stretched the
    // last candle's high/low to reach the live price, producing a
    // permanent full-height "wick" pillar wherever they'd diverged to.
    const port = new EquityMarketDataSimulator(42);
    const candles = await firstValueFrom(port.candles("MSFT", tf));
    expect(candles.at(-1)?.close).toBeCloseTo(port.currentPrice("MSFT"), 6);
  });

  it("is deterministic — repeated calls for the same symbol+timeframe reproduce the same close-price path", async () => {
    const port = new EquityMarketDataSimulator(42);
    const first = await firstValueFrom(port.candles("MSFT", "1M"));
    const second = await firstValueFrom(port.candles("MSFT", "1M"));
    expect(
      second.map((c) => {
        return c.close;
      }),
    ).toEqual(
      first.map((c) => {
        return c.close;
      }),
    );
  });
});
