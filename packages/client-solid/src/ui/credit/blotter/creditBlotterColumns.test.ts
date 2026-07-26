import { describe, expect, it } from "vitest";

import { type CreditTrade, Direction } from "@rtc/domain";

import type { ColumnDef } from "#/ui/fx/blotter/blotterColumns";

import { CREDIT_COLUMNS, formatCreditCell } from "./creditBlotterColumns";

describe("CREDIT_COLUMNS metadata", () => {
  it("exposes the expected ordered column keys", () => {
    expect(
      CREDIT_COLUMNS.map((c) => {
        return c.key;
      }),
    ).toEqual([
      "tradeId",
      "status",
      "tradeDate",
      "direction",
      "counterParty",
      "cusip",
      "security",
      "quantity",
      "orderType",
      "unitPrice",
    ]);
  });

  it("leaves only the last column flexible, sizing the rest in fixed px", () => {
    const flexible = CREDIT_COLUMNS.filter((c) => {
      return c.width === undefined;
    });
    expect(
      flexible.map((c) => {
        return c.key;
      }),
    ).toEqual(["unitPrice"]);
  });
});

describe("formatCreditCell", () => {
  it("formats an ISO trade date as DD-Mon-YYYY", () => {
    expect(
      formatCreditCell(trade({ tradeDate: "2024-03-05" }), colFor("tradeDate")),
    ).toBe("05-Mar-2024");
  });

  it("returns the raw string for an unparseable trade date", () => {
    // Mirrors formatFxCell's same guard (blotterColumns.test.ts). Rows built by
    // creditTradesVm always carry a valid ISO slice, so this is the fallback
    // for a row that reached the formatter from anywhere else — it must render
    // what it was given rather than "NaN-undefined-NaN".
    expect(
      formatCreditCell(trade({ tradeDate: "not-a-date" }), colFor("tradeDate")),
    ).toBe("not-a-date");
  });

  it("renders the status column as the constant Accepted", () => {
    // Every derived credit row is an accepted quote, so the column is a label
    // rather than a field read.
    expect(formatCreditCell(trade(), colFor("status"))).toBe("Accepted");
  });

  it("formats quantity with thousands separators and no decimals", () => {
    expect(
      formatCreditCell(trade({ quantity: 2_500_000 }), colFor("quantity")),
    ).toBe("2,500,000");
  });

  it("prefixes the unit price with a dollar sign", () => {
    expect(
      formatCreditCell(trade({ unitPrice: 99.5 }), colFor("unitPrice")),
    ).toBe("$99.5");
  });

  it("stringifies other columns directly", () => {
    expect(formatCreditCell(trade({ tradeId: 7001 }), colFor("tradeId"))).toBe(
      "7001",
    );
    expect(
      formatCreditCell(
        trade({ direction: Direction.Sell }),
        colFor("direction"),
      ),
    ).toBe("Sell");
    expect(
      formatCreditCell(trade({ counterParty: "Citi" }), colFor("counterParty")),
    ).toBe("Citi");
    expect(formatCreditCell(trade(), colFor("orderType"))).toBe("AON");
  });
});

function trade(over: Partial<CreditTrade> = {}): CreditTrade {
  return {
    tradeId: 7001,
    status: "accepted",
    tradeDate: "2024-03-05",
    direction: Direction.Buy,
    counterParty: "Adaptive Bank",
    cusip: "912828ZQ6",
    security: "T 1.5 02/34",
    quantity: 5000,
    orderType: "AON",
    unitPrice: 99,
    ...over,
  };
}

function colFor(key: keyof CreditTrade): ColumnDef<CreditTrade> {
  const c = CREDIT_COLUMNS.find((col) => {
    return col.key === key;
  });

  if (!c) {
    throw new Error(`no column for ${String(key)}`);
  }

  return c;
}
