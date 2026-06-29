import { afterEach, vi } from "vitest";

import { describePositionPortContract } from "../ports/__contracts__/PositionPortContract.js";
import { EquityMarketDataSimulator } from "./EquityMarketDataSimulator.js";
import { EquityPositionSimulator } from "./EquityPositionSimulator.js";

afterEach(() => {
  return vi.useRealTimers();
});

describePositionPortContract("EquityPositionSimulator", () => {
  vi.useFakeTimers();
  const marketData = new EquityMarketDataSimulator(42);
  const port = new EquityPositionSimulator(marketData);
  // Fill at 150 so avgPrice=150 while live AAPL mark (~190 seed) differs → non-zero pnl.
  port.onFill({ symbol: "AAPL", side: "buy", qty: 100, price: 150 });
  return {
    port,
    driver: {
      // Advance fake timers so at least one live quote tick fires through the lazy subscription.
      ackPositions: async () => {
        await vi.advanceTimersByTimeAsync(600);
      },
    },
    teardown: () => {
      return vi.useRealTimers();
    },
  };
});
