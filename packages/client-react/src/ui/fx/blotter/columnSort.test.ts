import { describe, expect, it } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import {
  applySortToTrades,
  nextSortDirection,
  type SortState,
} from "./columnSort";

function trade(over: Partial<Trade> = {}): Trade {
  return {
    tradeId: 1,
    tradeName: "Alice",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.1,
    status: TradeStatus.Done,
    tradeDate: "2026-01-01",
    valueDate: "2026-01-03",
    ...over,
  };
}

describe("nextSortDirection", () => {
  it("starts a date/ID column descending on first click", () => {
    const none: SortState = { column: null, direction: null };
    expect(nextSortDirection("tradeId", none)).toEqual({
      column: "tradeId",
      direction: "desc",
    });
    expect(nextSortDirection("tradeDate", none)).toEqual({
      column: "tradeDate",
      direction: "desc",
    });
  });

  it("starts a non-desc column (text or numeric) ascending on first click", () => {
    const none: SortState = { column: null, direction: null };
    expect(nextSortDirection("tradeName", none)).toEqual({
      column: "tradeName",
      direction: "asc",
    });
    expect(nextSortDirection("notional", none)).toEqual({
      column: "notional",
      direction: "asc",
    });
    expect(nextSortDirection("spotRate", none)).toEqual({
      column: "spotRate",
      direction: "asc",
    });
  });

  it("cycles desc -> asc -> none on a desc-first column", () => {
    const desc: SortState = { column: "tradeId", direction: "desc" };
    const asc = nextSortDirection("tradeId", desc);
    expect(asc).toEqual({ column: "tradeId", direction: "asc" });
    expect(nextSortDirection("tradeId", asc)).toEqual({
      column: null,
      direction: null,
    });
  });

  it("re-initialises direction when the same column had a null direction", () => {
    const nulled: SortState = { column: "notional", direction: null };
    expect(nextSortDirection("notional", nulled)).toEqual({
      column: "notional",
      direction: "asc",
    });
    const nulledText: SortState = { column: "tradeName", direction: null };
    expect(nextSortDirection("tradeName", nulledText)).toEqual({
      column: "tradeName",
      direction: "asc",
    });
  });

  it("switches to a fresh column when a different one was active", () => {
    const active: SortState = { column: "notional", direction: "asc" };
    expect(nextSortDirection("tradeName", active)).toEqual({
      column: "tradeName",
      direction: "asc",
    });
  });
});

describe("applySortToTrades", () => {
  it("returns the input untouched when no column is selected", () => {
    const trades = [trade({ tradeId: 2 }), trade({ tradeId: 1 })];
    expect(applySortToTrades(trades, { column: null, direction: null })).toBe(
      trades,
    );
  });

  it("returns the input untouched when direction is null", () => {
    const trades = [trade({ tradeId: 2 }), trade({ tradeId: 1 })];
    expect(
      applySortToTrades(trades, { column: "tradeId", direction: null }),
    ).toBe(trades);
  });

  it("sorts numbers ascending and descending", () => {
    const trades = [
      trade({ tradeId: 3, notional: 300 }),
      trade({ tradeId: 1, notional: 100 }),
      trade({ tradeId: 2, notional: 200 }),
    ];
    const asc = applySortToTrades(trades, {
      column: "notional",
      direction: "asc",
    });
    expect(
      asc.map((t) => {
        return t.notional;
      }),
    ).toEqual([100, 200, 300]);
    const desc = applySortToTrades(trades, {
      column: "notional",
      direction: "desc",
    });
    expect(
      desc.map((t) => {
        return t.notional;
      }),
    ).toEqual([300, 200, 100]);
  });

  it("sorts strings case-insensitively ascending and descending", () => {
    const trades = [
      trade({ tradeName: "charlie" }),
      trade({ tradeName: "Alice" }),
      trade({ tradeName: "bob" }),
    ];
    const asc = applySortToTrades(trades, {
      column: "tradeName",
      direction: "asc",
    });
    expect(
      asc.map((t) => {
        return t.tradeName;
      }),
    ).toEqual(["Alice", "bob", "charlie"]);
    const desc = applySortToTrades(trades, {
      column: "tradeName",
      direction: "desc",
    });
    expect(
      desc.map((t) => {
        return t.tradeName;
      }),
    ).toEqual(["charlie", "bob", "Alice"]);
  });

  it("sorts ISO date strings lexicographically", () => {
    const trades = [
      trade({ tradeId: 1, tradeDate: "2026-03-01" }),
      trade({ tradeId: 2, tradeDate: "2026-01-01" }),
      trade({ tradeId: 3, tradeDate: "2026-02-01" }),
    ];
    const asc = applySortToTrades(trades, {
      column: "tradeDate",
      direction: "asc",
    });
    expect(
      asc.map((t) => {
        return t.tradeDate;
      }),
    ).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("does not mutate the original array", () => {
    const trades = [trade({ notional: 200 }), trade({ notional: 100 })];
    const before = [...trades];
    applySortToTrades(trades, { column: "notional", direction: "asc" });
    expect(trades).toEqual(before);
  });
});
