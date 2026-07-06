import { describe, expect, it } from "vitest";

import { Direction, deriveDealtCurrency } from "./trade.js";

describe("deriveDealtCurrency", () => {
  it("Buy EURUSD => dealt EUR (base)", () => {
    expect(deriveDealtCurrency("EURUSD", Direction.Buy)).toBe("EUR");
  });

  // Dealt currency is always the pair's base currency in this app's UX —
  // the tile notional input is always denominated in the base currency
  // regardless of direction (matches upstream ReactiveTraderCloud + the
  // seeded blotter rows: Sell EURJPY => DEAL EUR, Sell USDJPY => DEAL USD).
  it("Sell EURUSD => dealt EUR (base, not terms)", () => {
    expect(deriveDealtCurrency("EURUSD", Direction.Sell)).toBe("EUR");
  });

  it("Buy USDJPY => dealt USD (base)", () => {
    expect(deriveDealtCurrency("USDJPY", Direction.Buy)).toBe("USD");
  });

  it("Sell USDJPY => dealt USD (base, not terms)", () => {
    expect(deriveDealtCurrency("USDJPY", Direction.Sell)).toBe("USD");
  });
});
