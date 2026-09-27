import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRADER_NAME,
  Direction,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import {
  createActivityScan,
  createNewTradeScan,
  formatClockTime,
  reduceActivity,
  reduceNewTrades,
} from "#/presenters/blotterFolds";

describe("blotterFolds", () => {
  it("reduceNewTrades: the first snapshot is never new; later unseen ids are", () => {
    const first = reduceNewTrades(createNewTradeScan(), [createTrade(1)]);
    expect([...first.fresh]).toEqual([]);
    const second = reduceNewTrades(first, [createTrade(1), createTrade(2)]);
    expect([...second.fresh]).toEqual([2]);
    const third = reduceNewTrades(second, [createTrade(1), createTrade(2)]);
    expect([...third.fresh]).toEqual([]);
  });

  it("reduceActivity: seeded rows never appear; a live row is stamped with the supplied clock, newest first", () => {
    const seeded = reduceActivity(
      createActivityScan(),
      [createTrade(1, DEFAULT_TRADER_NAME)],
      0,
    );
    expect(seeded.entries).toEqual([]);
    const live = reduceActivity(
      seeded,
      [
        createTrade(1, DEFAULT_TRADER_NAME),
        createTrade(2, "A.Stark"),
        createTrade(3, DEFAULT_TRADER_NAME),
      ],
      Date.UTC(2026, 0, 1, 9, 8, 7),
    );
    expect(
      live.entries.map((e) => {
        return e.trade.tradeId;
      }),
    ).toEqual([3]);
    expect(live.entries[0].time).toBe(
      formatClockTime(Date.UTC(2026, 0, 1, 9, 8, 7)),
    );
    // No additions → the SAME entries array (the RxJS scan's short-circuit).
    const unchanged = reduceActivity(
      live,
      [createTrade(1), createTrade(2), createTrade(3)],
      1,
    );
    expect(unchanged.entries).toBe(live.entries);
  });

  it("formatClockTime pads to HH:MM:SS", () => {
    expect(formatClockTime(new Date(2026, 0, 1, 1, 2, 3).getTime())).toBe(
      "01:02:03",
    );
  });

  function createTrade(tradeId: number, tradeName = "A.Stark"): Trade {
    return {
      tradeId,
      tradeName,
      currencyPair: "EURUSD",
      notional: 1_000_000,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1.1,
      status: TradeStatus.Done,
      tradeDate: "2026-01-01",
      valueDate: "2026-01-03",
    };
  }
});
