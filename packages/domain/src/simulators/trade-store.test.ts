import { describe, it, expect } from "vitest";
import { ExecutionSimulator } from "./execution-simulator.js";
import { MockTradeStore } from "./trade-store.js";
import { Direction, TradeStatus } from "../fx/trade.js";

describe("MockTradeStore", () => {
  it("starts with empty trade list", async () => {
    const engine = new ExecutionSimulator();
    const store = new MockTradeStore(engine);

    for await (const trades of store.getTradeStream()) {
      expect(trades).toHaveLength(0);
      break; // only check initial emission
    }
  });

  it("accumulates Done trades", async () => {
    const engine = new ExecutionSimulator();
    const store = new MockTradeStore(engine);
    const results: any[][] = [];

    const iter = store.getTradeStream()[Symbol.asyncIterator]();

    // Get initial empty state
    const first = await iter.next();
    results.push([...(first.value as any)]);

    // Execute a trade, then read next emission
    const tradePromise = engine.executeTrade({
      currencyPair: "EURUSD",
      spotRate: 1.5,
      direction: Direction.Buy,
      notional: 1_000_000,
      dealtCurrency: "EUR",
    });

    const [trade, second] = await Promise.all([tradePromise, iter.next()]);
    results.push([...(second.value as any)]);

    expect(results[0]).toHaveLength(0);
    expect(results[1]).toHaveLength(1);
    expect(results[1][0].tradeId).toBe(trade.tradeId);
  });

  it("accumulates Rejected trades too", async () => {
    const engine = new ExecutionSimulator();
    const store = new MockTradeStore(engine);

    const iter = store.getTradeStream()[Symbol.asyncIterator]();
    await iter.next(); // skip initial empty

    const tradePromise = engine.executeTrade({
      currencyPair: "GBPJPY",
      spotRate: 150.0,
      direction: Direction.Sell,
      notional: 1_000_000,
      dealtCurrency: "JPY",
    });

    const [trade, next] = await Promise.all([tradePromise, iter.next()]);

    expect(trade.status).toBe(TradeStatus.Rejected);
    const trades = next.value as any[];
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe(TradeStatus.Rejected);
  });

  it("displays newest first", async () => {
    const engine = new ExecutionSimulator();
    const store = new MockTradeStore(engine);

    const iter = store.getTradeStream()[Symbol.asyncIterator]();
    await iter.next(); // skip initial empty

    // Execute first trade
    const t1Promise = engine.executeTrade({
      currencyPair: "EURUSD",
      spotRate: 1.5,
      direction: Direction.Buy,
      notional: 1_000_000,
      dealtCurrency: "EUR",
    });
    const [t1] = await Promise.all([t1Promise, iter.next()]);

    // Execute second trade
    const t2Promise = engine.executeTrade({
      currencyPair: "AUDUSD",
      spotRate: 0.75,
      direction: Direction.Sell,
      notional: 500_000,
      dealtCurrency: "USD",
    });
    const [t2, snapshot] = await Promise.all([t2Promise, iter.next()]);

    const trades = snapshot.value as any[];
    expect(trades).toHaveLength(2);
    expect(trades[0].tradeId).toBe(t2.tradeId); // newest first
    expect(trades[1].tradeId).toBe(t1.tradeId);
  });
});
