import { expect, test } from "@jest/globals";

import { Direction, TradeStatus } from "@rtc/domain";

import { blotterSlice } from "./blotter";

test("useTrades returns the identical roster reference across calls", () => {
  const first = blotterSlice.useTrades();
  const second = blotterSlice.useTrades();

  expect(second).toBe(first);
});

test("useNewTradeIds returns an identical, empty set reference across calls", () => {
  const first = blotterSlice.useNewTradeIds();
  const second = blotterSlice.useNewTradeIds();

  expect(second).toBe(first);
  expect(first.size).toBe(0);
});

test("useActivity returns the identical entries reference across calls", () => {
  const first = blotterSlice.useActivity();
  const second = blotterSlice.useActivity();

  expect(second).toBe(first);
});

test("every trade carries all required Trade fields", () => {
  const trades = blotterSlice.useTrades();

  expect(trades.length).toBeGreaterThanOrEqual(5);
  expect(trades.length).toBeLessThanOrEqual(8);

  for (const trade of trades) {
    expect(typeof trade.tradeId).toBe("number");
    expect(typeof trade.tradeName).toBe("string");
    expect(trade.tradeName.length).toBeGreaterThan(0);
    expect(typeof trade.currencyPair).toBe("string");
    expect(trade.currencyPair).toHaveLength(6);
    expect(typeof trade.notional).toBe("number");
    expect(trade.notional).toBeGreaterThan(0);
    expect(typeof trade.dealtCurrency).toBe("string");
    expect(trade.dealtCurrency).toHaveLength(3);
    // Dealt currency is always the pair's base (first 3 chars) —
    // deriveDealtCurrency's documented convention (packages/domain/src/fx/trade.ts).
    expect(trade.dealtCurrency).toBe(trade.currencyPair.slice(0, 3));
    expect(Object.values(Direction)).toContain(trade.direction);
    expect(typeof trade.spotRate).toBe("number");
    expect(trade.spotRate).toBeGreaterThan(0);
    expect(Object.values(TradeStatus)).toContain(trade.status);
    expect(trade.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(trade.valueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
});

// The guard that stops someone later trimming this fixture down to fewer
// visual paths — TradeRow styles the direction subline and the status pill
// differently per (Direction, TradeStatus) pair, so a roster missing a
// COMBINATION silently stops testing that row variant even while still
// containing more than one Direction and more than one TradeStatus
// individually (e.g. Buy/Done, Buy/Pending, Sell/Done, Sell/Pending covers
// 2 directions and 2 statuses yet never renders a Rejected pill at all — a
// weaker "more than one of each" assertion would pass on that roster).
// Asserting the exact 6-element combination set is what catches it: with 6
// trades and exactly 6 possible combinations, any duplicate combination
// necessarily means some other combination is missing.
test("the roster covers all six Direction × TradeStatus combinations exactly once", () => {
  const trades = blotterSlice.useTrades();

  const combinations = new Set(
    trades.map((trade) => {
      return `${trade.direction}/${trade.status}`;
    }),
  );

  const allDirections = Object.values(Direction);
  const allStatuses = Object.values(TradeStatus);
  const expectedCombinations = new Set(
    allDirections.flatMap((direction) => {
      return allStatuses.map((status) => {
        return `${direction}/${status}`;
      });
    }),
  );

  expect(trades.length).toBe(expectedCombinations.size);
  expect(combinations).toEqual(expectedCombinations);
});

// T32: the real bug was every field being a literal except tradeDate/
// valueDate, which came from Date.now() and silently re-dated the golden
// every calendar day. Asserting the exact literal (not just the regex shape
// above) means a future accidental clock read fails this test loudly instead
// of drifting the golden unnoticed.
test("no trade date depends on the current clock — every date is the exact pinned literal", () => {
  const trades = blotterSlice.useTrades();
  const byId = new Map(
    trades.map((trade) => {
      return [trade.tradeId, trade];
    }),
  );

  expect(byId.get(4201)).toMatchObject({
    tradeDate: "2026-07-22",
    valueDate: "2026-07-24",
  });
  expect(byId.get(4202)).toMatchObject({
    tradeDate: "2026-07-22",
    valueDate: "2026-07-24",
  });
  expect(byId.get(4203)).toMatchObject({
    tradeDate: "2026-07-26",
    valueDate: "2026-07-28",
  });
  expect(byId.get(4204)).toMatchObject({
    tradeDate: "2026-07-25",
    valueDate: "2026-07-27",
  });
  expect(byId.get(4205)).toMatchObject({
    tradeDate: "2026-07-21",
    valueDate: "2026-07-23",
  });
  expect(byId.get(4206)).toMatchObject({
    tradeDate: "2026-07-27",
    valueDate: "2026-07-29",
  });
});

test("useActivity's entries reference trades from the roster and carry a pinned, non-clock wall-clock time", () => {
  const trades = blotterSlice.useTrades();
  const activity = blotterSlice.useActivity();

  expect(activity.length).toBeGreaterThan(0);

  for (const entry of activity) {
    expect(trades).toContain(entry.trade);
    expect(entry.time).toBe("11:56:48");
  }
});
