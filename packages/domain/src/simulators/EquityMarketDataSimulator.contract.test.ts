import { afterEach, vi } from "vitest";

import { describeMarketDataPortContract } from "../ports/__contracts__/MarketDataPortContract.js";
import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";

afterEach(() => {
  return vi.useRealTimers();
});

describeMarketDataPortContract("EquityMarketDataSimulator", () => {
  vi.useFakeTimers();
  const port = new EquityMarketDataSimulator(42);
  return {
    port,
    driver: {
      // watchlist/candles/depth resolve synchronously via of(...)/defer.
      ackWatchlist: async () => {
        await Promise.resolve();
      },
      // quotes emits the seeded snapshot first via concat(of(first), live$).
      tickQuote: async () => {
        await Promise.resolve();
      },
      ackCandles: async () => {
        await Promise.resolve();
      },
      ackDepth: async () => {
        await Promise.resolve();
      },
    },
    teardown: () => {
      return vi.useRealTimers();
    },
  };
});
