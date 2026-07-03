import { describe, expect, it } from "vitest";

import { netExposureByCurrency } from "./netExposure.js";
import type { CurrencyPairPosition } from "./position.js";

describe("netExposureByCurrency", () => {
  it("aggregates base amounts into the base currency and counter amounts into the terms currency", () => {
    const result = netExposureByCurrency([
      position("EURUSD", 6_200_000, -6_800_000),
      position("EURJPY", 4_000_000, -4_300_000),
      position("USDJPY", -13_400_000, 11_300_000),
    ]);
    expect(result).toEqual([
      { currency: "EUR", amountMillions: 10.2 },
      { currency: "USD", amountMillions: -20.2 },
      { currency: "JPY", amountMillions: 7 },
    ]);
  });

  it("preserves first-appearance order and rounds to one decimal", () => {
    const result = netExposureByCurrency([
      position("GBPUSD", -4_120_000, 5_240_000),
    ]);
    expect(result).toEqual([
      { currency: "GBP", amountMillions: -4.1 },
      { currency: "USD", amountMillions: 5.2 },
    ]);
  });

  it("drops currencies that net to zero", () => {
    const result = netExposureByCurrency([
      position("EURUSD", 1_000_000, 0),
      position("EURJPY", -1_000_000, 500_000),
    ]);
    expect(result).toEqual([{ currency: "JPY", amountMillions: 0.5 }]);
  });

  it("returns empty for no positions", () => {
    expect(netExposureByCurrency([])).toEqual([]);
  });
});

function position(
  symbol: string,
  baseTradedAmount: number,
  counterTradedAmount: number,
): CurrencyPairPosition {
  return { symbol, basePnl: 0, baseTradedAmount, counterTradedAmount };
}
