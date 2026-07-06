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

  it("starts with the five PROTO seed trades, newest first", async () => {
    const store = new TradeStoreSimulator(new ExecutionSimulator());
    const snapshot = await firstValueFrom(store.getTradeStream());
    expect(
      snapshot.map((t) => {
        return t.tradeId;
      }),
    ).toEqual([1042, 1041, 1040, 1039, 1038]);

    const t1042 = snapshot[0];
    expect(t1042.currencyPair).toBe("EURUSD");
    expect(t1042.direction).toBe(Direction.Buy);
    expect(t1042.status).toBe(TradeStatus.Done);
    expect(t1042.notional).toBe(1_000_000);
    expect(t1042.dealtCurrency).toBe("EUR");
    expect(t1042.spotRate).toBe(1.09213);
    expect(t1042.tradeName).toBe("A.Stark");

    const t1040 = snapshot[2];
    expect(t1040.status).toBe(TradeStatus.Rejected);
    expect(t1040.tradeName).toBe("N.Romanoff");

    // value date = trade date + 2 days
    const dayMs = 86_400_000;

    for (const t of snapshot) {
      expect(
        new Date(t.valueDate).getTime() - new Date(t.tradeDate).getTime(),
      ).toBe(2 * dayMs);
    }
  });

  it("live executed trades get ids continuing from 1043", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const store = new TradeStoreSimulator(engine);
    const executed = firstValueFrom(
      engine.executeTrade({
        currencyPair: "EURUSD",
        spotRate: 1.09213,
        direction: Direction.Buy,
        notional: 1_000_000,
        dealtCurrency: "EUR",
      }),
    );
    await vi.advanceTimersByTimeAsync(2_100);
    const trade = await executed;
    expect(trade.tradeId).toBe(1043);
    expect(trade.tradeName).toBe("You");
    const snapshot = await firstValueFrom(store.getTradeStream());
    expect(snapshot).toHaveLength(6);
    vi.useRealTimers();
  });

  it("accumulates Done trades", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const store = new TradeStoreSimulator(engine);
    const snapshots: (readonly Trade[])[] = [];

    const sub = store.getTradeStream().subscribe((s) => {
      return snapshots.push(s);
    });

    // initial snapshot has the 5 PROTO seed trades
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toHaveLength(5);

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
    expect(snapshots[1]).toHaveLength(6);
    expect(snapshots[1][0].tradeId).toBe(trade.tradeId);

    sub.unsubscribe();
  });

  it("accumulates Rejected trades too", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const store = new TradeStoreSimulator(engine);
    const snapshots: (readonly Trade[])[] = [];

    const sub = store.getTradeStream().subscribe((s) => {
      return snapshots.push(s);
    });

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
    expect(trades).toHaveLength(6);
    expect(trades[0].status).toBe(TradeStatus.Rejected);

    sub.unsubscribe();
  });

  it("displays newest first", async () => {
    vi.useFakeTimers();
    const engine = new ExecutionSimulator();
    const store = new TradeStoreSimulator(engine);
    const snapshots: (readonly Trade[])[] = [];

    const sub = store.getTradeStream().subscribe((s) => {
      return snapshots.push(s);
    });

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

    // snapshots: [initial 5 seeds, after t1, after t2]
    expect(snapshots).toHaveLength(3);
    const trades = snapshots[2];
    expect(trades).toHaveLength(7);
    expect(trades[0].tradeId).toBe(t2.tradeId); // newest first
    expect(trades[1].tradeId).toBe(t1.tradeId);

    sub.unsubscribe();
  });
});
