import { describe, expect, it } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { applyFilters, type ColumnFilter } from "./filterState";

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

function filters(...entries: ColumnFilter[]): Map<keyof Trade, ColumnFilter> {
  return new Map(
    entries.map((f) => {
      return [f.column, f];
    }),
  );
}

describe("applyFilters — no filters", () => {
  it("returns all trades when no column filter and empty quick filter", () => {
    const trades = [trade({ tradeId: 1 }), trade({ tradeId: 2 })];
    expect(applyFilters(trades, new Map(), "")).toEqual(trades);
  });

  it("ignores a whitespace-only quick filter", () => {
    const trades = [trade({ tradeId: 1 })];
    expect(applyFilters(trades, new Map(), "   ")).toEqual(trades);
  });
});

describe("applyFilters — set filter", () => {
  it("keeps only trades whose value is in the selected set", () => {
    const trades = [
      trade({ tradeId: 1, currencyPair: "EURUSD" }),
      trade({ tradeId: 2, currencyPair: "USDJPY" }),
      trade({ tradeId: 3, currencyPair: "GBPUSD" }),
    ];
    const f = filters({
      type: "set",
      column: "currencyPair",
      values: new Set(["EURUSD", "GBPUSD"]),
    });
    expect(
      applyFilters(trades, f, "").map((t) => {
        return t.tradeId;
      }),
    ).toEqual([1, 3]);
  });
});

describe("applyFilters — number filter comparators", () => {
  const trades = [
    trade({ tradeId: 1, notional: 100 }),
    trade({ tradeId: 2, notional: 200 }),
    trade({ tradeId: 3, notional: 300 }),
  ];

  function run(filter: ColumnFilter) {
    return applyFilters(trades, filters(filter), "").map((t) => {
      return t.tradeId;
    });
  }

  it("eq", () => {
    return expect(
      run({ type: "number", column: "notional", comparator: "eq", value: 200 }),
    ).toEqual([2]);
  });
  it("neq", () => {
    return expect(
      run({
        type: "number",
        column: "notional",
        comparator: "neq",
        value: 200,
      }),
    ).toEqual([1, 3]);
  });
  it("lt", () => {
    return expect(
      run({ type: "number", column: "notional", comparator: "lt", value: 200 }),
    ).toEqual([1]);
  });
  it("lte", () => {
    return expect(
      run({
        type: "number",
        column: "notional",
        comparator: "lte",
        value: 200,
      }),
    ).toEqual([1, 2]);
  });
  it("gt", () => {
    return expect(
      run({ type: "number", column: "notional", comparator: "gt", value: 200 }),
    ).toEqual([3]);
  });
  it("gte", () => {
    return expect(
      run({
        type: "number",
        column: "notional",
        comparator: "gte",
        value: 200,
      }),
    ).toEqual([2, 3]);
  });
  it("inRange with valueTo", () => {
    return expect(
      run({
        type: "number",
        column: "notional",
        comparator: "inRange",
        value: 150,
        valueTo: 250,
      }),
    ).toEqual([2]);
  });
  it("inRange falls back to value when valueTo is absent", () => {
    return expect(
      run({
        type: "number",
        column: "notional",
        comparator: "inRange",
        value: 200,
      }),
    ).toEqual([2]);
  });

  it("passes through trades whose target field is not numeric", () => {
    // currencyPair is a string; a number filter on it cannot apply, so all pass.
    const strTrades = [trade({ tradeId: 1 }), trade({ tradeId: 2 })];
    const f = filters({
      type: "number",
      column: "currencyPair",
      comparator: "eq",
      value: 5,
    });
    expect(
      applyFilters(strTrades, f, "").map((t) => {
        return t.tradeId;
      }),
    ).toEqual([1, 2]);
  });
});

describe("applyFilters — date filter comparators", () => {
  const trades = [
    trade({ tradeId: 1, tradeDate: "2026-01-01" }),
    trade({ tradeId: 2, tradeDate: "2026-02-01" }),
    trade({ tradeId: 3, tradeDate: "2026-03-01" }),
  ];

  function run(filter: ColumnFilter) {
    return applyFilters(trades, filters(filter), "").map((t) => {
      return t.tradeId;
    });
  }

  it("eq", () => {
    return expect(
      run({
        type: "date",
        column: "tradeDate",
        comparator: "eq",
        value: "2026-02-01",
      }),
    ).toEqual([2]);
  });
  it("neq", () => {
    return expect(
      run({
        type: "date",
        column: "tradeDate",
        comparator: "neq",
        value: "2026-02-01",
      }),
    ).toEqual([1, 3]);
  });
  it("lt", () => {
    return expect(
      run({
        type: "date",
        column: "tradeDate",
        comparator: "lt",
        value: "2026-02-01",
      }),
    ).toEqual([1]);
  });
  it("lte", () => {
    return expect(
      run({
        type: "date",
        column: "tradeDate",
        comparator: "lte",
        value: "2026-02-01",
      }),
    ).toEqual([1, 2]);
  });
  it("gt", () => {
    return expect(
      run({
        type: "date",
        column: "tradeDate",
        comparator: "gt",
        value: "2026-02-01",
      }),
    ).toEqual([3]);
  });
  it("gte", () => {
    return expect(
      run({
        type: "date",
        column: "tradeDate",
        comparator: "gte",
        value: "2026-02-01",
      }),
    ).toEqual([2, 3]);
  });
  it("inRange with valueTo", () => {
    return expect(
      run({
        type: "date",
        column: "tradeDate",
        comparator: "inRange",
        value: "2026-01-15",
        valueTo: "2026-02-15",
      }),
    ).toEqual([2]);
  });
  it("inRange falls back to value when valueTo is absent", () => {
    return expect(
      run({
        type: "date",
        column: "tradeDate",
        comparator: "inRange",
        value: "2026-02-01",
      }),
    ).toEqual([2]);
  });
});

describe("applyFilters — multiple column filters (AND)", () => {
  it("requires every column filter to match", () => {
    const trades = [
      trade({ tradeId: 1, currencyPair: "EURUSD", notional: 100 }),
      trade({ tradeId: 2, currencyPair: "EURUSD", notional: 300 }),
      trade({ tradeId: 3, currencyPair: "USDJPY", notional: 100 }),
    ];
    const f = filters(
      { type: "set", column: "currencyPair", values: new Set(["EURUSD"]) },
      { type: "number", column: "notional", comparator: "lt", value: 200 },
    );
    expect(
      applyFilters(trades, f, "").map((t) => {
        return t.tradeId;
      }),
    ).toEqual([1]);
  });
});

describe("applyFilters — quick filter", () => {
  it("matches a single term against any field (case-insensitive)", () => {
    const trades = [
      trade({ tradeId: 1, currencyPair: "EURUSD" }),
      trade({ tradeId: 2, currencyPair: "USDJPY" }),
    ];
    expect(
      applyFilters(trades, new Map(), "jpy").map((t) => {
        return t.tradeId;
      }),
    ).toEqual([2]);
  });

  it("requires ALL space-separated terms to match (AND)", () => {
    const trades = [
      trade({ tradeId: 1, currencyPair: "EURUSD", tradeName: "Alice" }),
      trade({ tradeId: 2, currencyPair: "EURUSD", tradeName: "Bob" }),
    ];
    expect(
      applyFilters(trades, new Map(), "eurusd alice").map((t) => {
        return t.tradeId;
      }),
    ).toEqual([1]);
  });

  it("combines column filters and quick filter", () => {
    const trades = [
      trade({ tradeId: 1, currencyPair: "EURUSD", tradeName: "Alice" }),
      trade({ tradeId: 2, currencyPair: "USDJPY", tradeName: "Alice" }),
    ];
    const f = filters({
      type: "set",
      column: "currencyPair",
      values: new Set(["EURUSD"]),
    });
    expect(
      applyFilters(trades, f, "alice").map((t) => {
        return t.tradeId;
      }),
    ).toEqual([1]);
  });
});
