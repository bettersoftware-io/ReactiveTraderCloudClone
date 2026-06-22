import { firstValueFrom } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Trade } from "../fx/trade.js";
import { Direction, TradeStatus } from "../fx/trade.js";
import { ExecutionSimulator } from "./ExecutionSimulator.js";
import { TradeStoreSimulator } from "./TradeStoreSimulator.js";

const NORMAL_MAX_DELAY_MS = 2_000;

describe("TradeStoreSimulator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with empty trade list", () => {
    const engine = new ExecutionSimulator();
    const store = new TradeStoreSimulator(engine);
    const snapshots: (readonly Trade[])[] = [];

    const sub = store.getTradeStream().subscribe((s) => snapshots.push(s));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toHaveLength(0);
    sub.unsubscribe();
  });

  it("accumulates Done trades", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const store = new TradeStoreSimulator(engine);
    const snapshots: (readonly Trade[])[] = [];

    const sub = store.getTradeStream().subscribe((s) => snapshots.push(s));

    // initial empty snapshot
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toHaveLength(0);

    // Execute a trade
    const tradePromise = firstValueFrom(
      engine.executeTrade({
        currencyPair: "EURUSD",
        spotRate: 1.5,
        direction: Direction.Buy,
        notional: 1_000_000,
        dealtCurrency: "EUR",
      }),
    );
    await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
    const trade = await tradePromise;

    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toHaveLength(1);
    expect(snapshots[1][0].tradeId).toBe(trade.tradeId);

    sub.unsubscribe();
  });

  it("accumulates Rejected trades too", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const store = new TradeStoreSimulator(engine);
    const snapshots: (readonly Trade[])[] = [];

    const sub = store.getTradeStream().subscribe((s) => snapshots.push(s));

    const tradePromise = firstValueFrom(
      engine.executeTrade({
        currencyPair: "GBPJPY",
        spotRate: 150.0,
        direction: Direction.Sell,
        notional: 1_000_000,
        dealtCurrency: "JPY",
      }),
    );
    await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
    const trade = await tradePromise;

    expect(trade.status).toBe(TradeStatus.Rejected);
    expect(snapshots).toHaveLength(2);
    const trades = snapshots[1];
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe(TradeStatus.Rejected);

    sub.unsubscribe();
  });

  it("displays newest first", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const store = new TradeStoreSimulator(engine);
    const snapshots: (readonly Trade[])[] = [];

    const sub = store.getTradeStream().subscribe((s) => snapshots.push(s));

    // Execute first trade
    const t1Promise = firstValueFrom(
      engine.executeTrade({
        currencyPair: "EURUSD",
        spotRate: 1.5,
        direction: Direction.Buy,
        notional: 1_000_000,
        dealtCurrency: "EUR",
      }),
    );
    await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
    const t1 = await t1Promise;

    // Execute second trade
    const t2Promise = firstValueFrom(
      engine.executeTrade({
        currencyPair: "AUDUSD",
        spotRate: 0.75,
        direction: Direction.Sell,
        notional: 500_000,
        dealtCurrency: "USD",
      }),
    );
    await vi.advanceTimersByTimeAsync(NORMAL_MAX_DELAY_MS);
    const t2 = await t2Promise;

    // snapshots: [initial empty, after t1, after t2]
    expect(snapshots).toHaveLength(3);
    const trades = snapshots[2];
    expect(trades).toHaveLength(2);
    expect(trades[0].tradeId).toBe(t2.tradeId); // newest first
    expect(trades[1].tradeId).toBe(t1.tradeId);

    sub.unsubscribe();
  });
});
