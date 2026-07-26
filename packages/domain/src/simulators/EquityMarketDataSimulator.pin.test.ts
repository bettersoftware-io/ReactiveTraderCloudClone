import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";

// 2026-07-01T00:00:00Z — any fixed instant works; never change it, the
// snapshot is keyed to it.
const FIXED_NOW = 1_782_864_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EquityMarketDataSimulator 1D OHLC pin", () => {
  // Deepening the history (Task A3) must PREPEND older candles only: the
  // newest 60 candles' OHLC values are pinned here byte-for-byte. The
  // snapshot projects OHLC only, so adding `volume` (Task A2) doesn't
  // invalidate it.
  it("keeps the newest 60 1D candles byte-identical", async () => {
    const sim = new EquityMarketDataSimulator();
    const series = await firstValueFrom(sim.candles("AAPL", "1D"));
    const newest60 = series.slice(-60).map((c) => {
      return {
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      };
    });

    expect(newest60).toMatchSnapshot();
  });
});
