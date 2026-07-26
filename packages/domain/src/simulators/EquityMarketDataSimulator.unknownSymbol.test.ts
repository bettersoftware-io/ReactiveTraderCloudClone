import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";

// All three per-symbol streams guard an unknown symbol the same way, and none
// of the existing specs asks for one. The guard matters because the failure is
// otherwise silent-by-omission: without it a typo'd symbol yields a stream
// that simply never emits, which reads in the UI as "still loading" forever
// rather than as an error.

const UNKNOWN = "NOTREAL";

describe("EquityMarketDataSimulator unknown symbols", () => {
  it("errors the quotes stream", async () => {
    const sim = new EquityMarketDataSimulator(42);

    await expect(firstValueFrom(sim.quotes(UNKNOWN))).rejects.toThrow(
      `Unknown symbol: ${UNKNOWN}`,
    );
  });

  it("errors the candles stream", async () => {
    const sim = new EquityMarketDataSimulator(42);

    await expect(firstValueFrom(sim.candles(UNKNOWN))).rejects.toThrow(
      `Unknown symbol: ${UNKNOWN}`,
    );
  });

  it("errors the depth stream", async () => {
    const sim = new EquityMarketDataSimulator(42);

    await expect(firstValueFrom(sim.depth(UNKNOWN))).rejects.toThrow(
      `Unknown symbol: ${UNKNOWN}`,
    );
  });

  it("still serves a known symbol from the same instance", async () => {
    // Pins that the guard is a per-CALL check and does not poison the
    // simulator: an unknown lookup must not disturb the seeded symbol table.
    const sim = new EquityMarketDataSimulator(42);

    await expect(firstValueFrom(sim.quotes(UNKNOWN))).rejects.toThrow();

    const quote = await firstValueFrom(sim.quotes("AAPL"));

    expect(quote.symbol).toBe("AAPL");
    expect(quote.last).toBeGreaterThan(0);
  });
});
