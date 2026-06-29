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
  // Pre-populate one position via onFill so the describer can assert the PnL invariant.
  port.onFill({ symbol: "AAPL", side: "buy", qty: 100, price: 190 });
  return {
    port,
    driver: {
      // positions() is backed by BehaviorSubject — emits immediately on subscribe.
      ackPositions: async () => {
        await Promise.resolve();
      },
    },
    teardown: () => {
      return vi.useRealTimers();
    },
  };
});
