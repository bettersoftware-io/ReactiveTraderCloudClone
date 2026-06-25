import { describe, expect, it } from "vitest";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { COLUMNS, type ColumnDef, formatFxCell } from "./blotterColumns";

function trade(over: Partial<Trade> = {}): Trade {
  return {
    tradeId: 4001,
    tradeName: "Alice",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.09221,
    status: TradeStatus.Done,
    tradeDate: "2026-03-30",
    valueDate: "2026-04-01",
    ...over,
  };
}

function colFor(key: keyof Trade): ColumnDef<Trade> {
  const c = COLUMNS.find((c) => {
    return c.key === key;
  });
  if (!c) throw new Error(`no column for ${String(key)}`);
  return c;
}

describe("COLUMNS metadata", () => {
  it("exposes the expected ordered column keys", () => {
    expect(
      COLUMNS.map((c) => {
        return c.key;
      }),
    ).toEqual([
      "tradeId",
      "status",
      "tradeDate",
      "direction",
      "currencyPair",
      "dealtCurrency",
      "notional",
      "spotRate",
      "valueDate",
      "tradeName",
    ]);
  });

  it("pairs each key with its display label", () => {
    const labels = Object.fromEntries(
      COLUMNS.map((c) => {
        return [c.key, c.label];
      }),
    );
    expect(labels).toMatchObject({
      tradeId: "Trade ID",
      status: "Status",
      tradeDate: "Trade Date",
      direction: "Direction",
      currencyPair: "CCYCCY",
      dealtCurrency: "Deal CCY",
      notional: "Notional",
      spotRate: "Rate",
      valueDate: "Value Date",
      tradeName: "Trader",
    });
  });

  it("assigns the right filter type to each column", () => {
    const types = Object.fromEntries(
      COLUMNS.map((c) => {
        return [c.key, c.filterType];
      }),
    );
    expect(types).toMatchObject({
      tradeId: "number",
      notional: "number",
      spotRate: "number",
      tradeDate: "date",
      valueDate: "date",
      status: "set",
      direction: "set",
      currencyPair: "set",
      dealtCurrency: "set",
      tradeName: "set",
    });
  });
});

describe("formatFxCell", () => {
  it("formats ISO dates as DD-Mon-YYYY", () => {
    expect(
      formatFxCell(trade({ tradeDate: "2026-03-30" }), colFor("tradeDate")),
    ).toBe("30-Mar-2026");
    expect(
      formatFxCell(trade({ valueDate: "2026-01-05" }), colFor("valueDate")),
    ).toBe("05-Jan-2026");
  });

  it("returns the raw string for an unparseable date", () => {
    expect(
      formatFxCell(trade({ tradeDate: "not-a-date" }), colFor("tradeDate")),
    ).toBe("not-a-date");
  });

  it("formats notional with thousands separators and no decimals", () => {
    expect(
      formatFxCell(trade({ notional: 2_500_000 }), colFor("notional")),
    ).toBe("2,500,000");
  });

  it("formats the spot rate to 6 significant digits", () => {
    expect(formatFxCell(trade({ spotRate: 1.09221 }), colFor("spotRate"))).toBe(
      "1.09221",
    );
  });

  it("stringifies other columns directly", () => {
    expect(formatFxCell(trade({ tradeId: 4001 }), colFor("tradeId"))).toBe(
      "4001",
    );
    expect(
      formatFxCell(trade({ status: TradeStatus.Rejected }), colFor("status")),
    ).toBe("Rejected");
    expect(
      formatFxCell(trade({ direction: Direction.Sell }), colFor("direction")),
    ).toBe("Sell");
    expect(
      formatFxCell(trade({ currencyPair: "USDJPY" }), colFor("currencyPair")),
    ).toBe("USDJPY");
    expect(formatFxCell(trade({ tradeName: "Bob" }), colFor("tradeName"))).toBe(
      "Bob",
    );
  });
});
