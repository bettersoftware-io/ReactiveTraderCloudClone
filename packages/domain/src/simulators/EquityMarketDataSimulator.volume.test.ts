import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";

describe("EquityMarketDataSimulator candle volume", () => {
  it("emits a positive integer volume on every candle", async () => {
    const sim = new EquityMarketDataSimulator();
    const series = await firstValueFrom(sim.candles("AAPL", "1D"));

    expect(series.length).toBeGreaterThan(0);
    for (const c of series) {
      expect(Number.isInteger(c.volume)).toBe(true);
      expect(c.volume).toBeGreaterThan(0);
    }
  });

  it("is deterministic per symbol+timeframe and differs across symbols", async () => {
    const a1 = await firstValueFrom(
      new EquityMarketDataSimulator().candles("AAPL", "1D"),
    );
    const a2 = await firstValueFrom(
      new EquityMarketDataSimulator().candles("AAPL", "1D"),
    );
    const m = await firstValueFrom(
      new EquityMarketDataSimulator().candles("MSFT", "1D"),
    );

    expect(a1.map((c) => c.volume)).toEqual(a2.map((c) => c.volume));
    expect(a1.map((c) => c.volume)).not.toEqual(m.map((c) => c.volume));
  });
});
