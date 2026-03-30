import { describe, it, expect } from "vitest";
import { MockExecutionEngine } from "./execution-engine.js";
import { Direction, TradeStatus } from "../fx/trade.js";
import type { ExecutionRequest } from "../fx/trade.js";

function makeRequest(pair: string): ExecutionRequest {
  return {
    currencyPair: pair,
    spotRate: 1.5,
    direction: Direction.Buy,
    notional: 1_000_000,
    dealtCurrency: pair.slice(0, 3),
  };
}

describe("MockExecutionEngine", () => {
  it("GBPJPY is always Rejected", async () => {
    const engine = new MockExecutionEngine();
    const trade = await engine.executeTrade(makeRequest("GBPJPY"));
    expect(trade.status).toBe(TradeStatus.Rejected);
  });

  it("EURJPY is always Done", async () => {
    const engine = new MockExecutionEngine();
    const trade = await engine.executeTrade(makeRequest("EURJPY"));
    expect(trade.status).toBe(TradeStatus.Done);
  }, 10_000);

  it("other pairs are Done", async () => {
    const engine = new MockExecutionEngine();
    const trade = await engine.executeTrade(makeRequest("EURUSD"));
    expect(trade.status).toBe(TradeStatus.Done);
  });

  it("trade IDs auto-increment from 1", async () => {
    const engine = new MockExecutionEngine();
    const t1 = await engine.executeTrade(makeRequest("EURUSD"));
    const t2 = await engine.executeTrade(makeRequest("EURUSD"));
    expect(t1.tradeId).toBe(1);
    expect(t2.tradeId).toBe(2);
  });

  it("notifies listeners on execution", async () => {
    const engine = new MockExecutionEngine();
    const trades: any[] = [];
    engine.onTrade((t) => trades.push(t));

    await engine.executeTrade(makeRequest("EURUSD"));
    expect(trades).toHaveLength(1);
    expect(trades[0].tradeId).toBe(1);
  });

  it("response includes all request properties", async () => {
    const engine = new MockExecutionEngine();
    const request = makeRequest("AUDUSD");
    const trade = await engine.executeTrade(request);

    expect(trade.currencyPair).toBe("AUDUSD");
    expect(trade.spotRate).toBe(1.5);
    expect(trade.direction).toBe(Direction.Buy);
    expect(trade.notional).toBe(1_000_000);
    expect(trade.dealtCurrency).toBe("AUD");
  });
});
