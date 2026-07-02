import { describe, expect, test } from "vitest";

import { positionsVm } from "#/equities/positionsVm";
import type { EqOrder, EqSym } from "#/equities/types";

const RATES = {
  AAPL: 230,
  MSFT: 467,
  NVDA: 131,
  TSLA: 251,
  AMZN: 218,
  GOOGL: 178,
  META: 591,
  SPY: 588,
} as Record<EqSym, number>;

describe("positionsVm", () => {
  test("nets filled buys and sells per symbol with avg/mv/pl", () => {
    const rows = positionsVm(
      [
        order({ id: 1, side: "Buy", qty: 100, price: 220 }),
        order({ id: 2, side: "Sell", qty: 40, price: 240 }),
      ],
      RATES,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sym).toBe("AAPL");
    expect(rows[0].qty).toBe("60");
    expect(rows[0].plColor).toBe("var(--buy)");
  });

  test("net-zero symbols and Working orders drop out", () => {
    const rows = positionsVm(
      [
        order({ id: 1, side: "Buy", qty: 100 }),
        order({ id: 2, side: "Sell", qty: 100 }),
        order({ id: 3, side: "Buy", qty: 50, status: "Working" }),
      ],
      RATES,
    );
    expect(rows).toHaveLength(0);
  });
});

function order(part: Partial<EqOrder>): EqOrder {
  return {
    id: 1,
    time: "09:00:00",
    sym: "AAPL",
    side: "Buy",
    type: "Market",
    qty: 100,
    price: 220,
    status: "Filled",
    ...part,
  };
}
