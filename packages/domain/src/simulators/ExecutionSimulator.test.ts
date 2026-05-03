import { describe, it, expect, vi, afterEach } from "vitest";
import { firstValueFrom } from "rxjs";
import { ExecutionSimulator } from "./ExecutionSimulator.js";
import { Direction, TradeStatus } from "../fx/trade.js";
import type { ExecutionRequest, Trade } from "../fx/trade.js";

// Same constants as in ExecutionSimulator
const DELAYED_PAIR_MS = 4_000;
const NORMAL_MAX_DELAY_MS = 2_000;

function makeRequest(pair: string): ExecutionRequest {
  return {
    currencyPair: pair,
    spotRate: 1.5,
    direction: Direction.Buy,
    notional: 1_000_000,
    dealtCurrency: pair.slice(0, 3),
  };
}

describe("ExecutionSimulator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("GBPJPY is always Rejected", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const promise = firstValueFrom(engine.executeTrade(makeRequest("GBPJPY")));
    await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
    const trade = await promise;
    expect(trade.status).toBe(TradeStatus.Rejected);
  });

  it("EURJPY is always Done", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const promise = firstValueFrom(engine.executeTrade(makeRequest("EURJPY")));
    await vi.advanceTimersByTimeAsync(DELAYED_PAIR_MS);
    const trade = await promise;
    expect(trade.status).toBe(TradeStatus.Done);
  });

  it("other pairs are Done", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const promise = firstValueFrom(engine.executeTrade(makeRequest("EURUSD")));
    await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
    const trade = await promise;
    expect(trade.status).toBe(TradeStatus.Done);
  });

  it("trade IDs auto-increment from 1", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const p1 = firstValueFrom(engine.executeTrade(makeRequest("EURUSD")));
    await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
    const t1 = await p1;
    const p2 = firstValueFrom(engine.executeTrade(makeRequest("EURUSD")));
    await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
    const t2 = await p2;
    expect(t1.tradeId).toBe(1);
    expect(t2.tradeId).toBe(2);
  });

  it("notifies listeners on execution", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const trades: Trade[] = [];
    engine.onTrade((t) => trades.push(t));

    const promise = firstValueFrom(engine.executeTrade(makeRequest("EURUSD")));
    await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
    await promise;
    expect(trades).toHaveLength(1);
    expect(trades[0].tradeId).toBe(1);
  });

  it("response includes all request properties", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const request = makeRequest("AUDUSD");
    const promise = firstValueFrom(engine.executeTrade(request));
    await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
    const trade = await promise;

    expect(trade.currencyPair).toBe("AUDUSD");
    expect(trade.spotRate).toBe(1.5);
    expect(trade.direction).toBe(Direction.Buy);
    expect(trade.notional).toBe(1_000_000);
    expect(trade.dealtCurrency).toBe("AUD");
  });
});
