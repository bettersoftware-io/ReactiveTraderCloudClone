import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CANDLE_DEFAULT_VISIBLE,
  CANDLE_HISTORY_TOTAL,
  CANDLE_TIMEFRAMES,
} from "../equities/timeframe.js";
import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";

const FIXED_NOW = 1_782_864_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("deep candle history", () => {
  it("emits CANDLE_HISTORY_TOTAL candles for every timeframe", async () => {
    const sim = new EquityMarketDataSimulator();

    for (const tf of CANDLE_TIMEFRAMES) {
      const series = await firstValueFrom(sim.candles("AAPL", tf));
      expect(series).toHaveLength(CANDLE_HISTORY_TOTAL);
    }
  });

  it("times ascend strictly with no seam gap or duplicate at the prepend joint", async () => {
    const sim = new EquityMarketDataSimulator();
    const series = await firstValueFrom(sim.candles("AAPL", "1D"));

    for (let i = 1; i < series.length; i++) {
      expect(series[i].time).toBeGreaterThan(series[i - 1].time);
    }
  });

  it("keeps prices continuous across the prepend seam (no cliff)", async () => {
    const sim = new EquityMarketDataSimulator();
    const series = await firstValueFrom(sim.candles("AAPL", "1D"));
    const seamLeft = series[CANDLE_HISTORY_TOTAL - 60 - 1];
    const seamRight = series[CANDLE_HISTORY_TOTAL - 60];
    const jump = Math.abs(seamRight.open - seamLeft.close) / seamLeft.close;

    // One substep's max move is 2*vol; allow a few substeps of slack.
    expect(jump).toBeLessThan(0.05);
  });

  it("default-visible counts match the pre-deepening series lengths", () => {
    expect(CANDLE_DEFAULT_VISIBLE).toEqual({
      "1D": 60,
      "1W": 44,
      "1M": 48,
      "3M": 52,
    });
  });
});
