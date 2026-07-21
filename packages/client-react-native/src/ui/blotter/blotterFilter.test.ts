import { describe, expect, it } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import {
  BLOTTER_FILTERS,
  filterTrades,
  formatPair,
  formatRate,
  summarize,
} from "./blotterFilter";

const trades = [
  trade(1, TradeStatus.Done, Direction.Buy),
  trade(2, TradeStatus.Rejected, Direction.Sell),
  trade(3, TradeStatus.Pending, Direction.Buy),
  trade(4, TradeStatus.Done, Direction.Sell),
];

describe("filterTrades", () => {
  it("passes everything through for ALL", () => {
    expect(filterTrades(trades, "ALL")).toHaveLength(4);
  });

  it("matches each status chip", () => {
    expect(
      filterTrades(trades, "DONE").map((t) => {
        return t.tradeId;
      }),
    ).toEqual([1, 4]);
    expect(
      filterTrades(trades, "REJECTED").map((t) => {
        return t.tradeId;
      }),
    ).toEqual([2]);
    expect(
      filterTrades(trades, "PENDING").map((t) => {
        return t.tradeId;
      }),
    ).toEqual([3]);
  });

  it("exposes the prototype chip set in order", () => {
    expect(BLOTTER_FILTERS).toEqual(["ALL", "DONE", "PENDING", "REJECTED"]);
  });
});

describe("summarize", () => {
  it("counts fills and the buy/sell split", () => {
    expect(summarize(trades)).toEqual({ fills: 4, buys: 2, sells: 2 });
  });

  it("is zeroed for an empty blotter", () => {
    expect(summarize([])).toEqual({ fills: 0, buys: 0, sells: 0 });
  });
});

describe("formatting", () => {
  it("splits the symbol into base/terms", () => {
    expect(formatPair("EURUSD")).toBe("EUR/USD");
  });

  it("uses 3dp for JPY pairs and 5dp otherwise", () => {
    expect(formatRate(151.2405, "USDJPY")).toBe("151.240");
    expect(formatRate(1.087234, "EURUSD")).toBe("1.08723");
  });
});

function trade(
  id: number,
  status: TradeStatus,
  direction: Direction,
  currencyPair = "EURUSD",
): Trade {
  return {
    tradeId: id,
    tradeName: `T${id}`,
    currencyPair,
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction,
    spotRate: 1.08723,
    status,
    tradeDate: "2026-07-20",
    valueDate: "2026-07-22",
  };
}
