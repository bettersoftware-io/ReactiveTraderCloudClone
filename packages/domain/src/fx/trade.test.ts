import { describe, expect, it } from "vitest";

import { Direction, deriveDealtCurrency } from "./trade.js";

describe("deriveDealtCurrency", () => {
  it("Buy EURUSD => dealt EUR (base)", () => {
    expect(deriveDealtCurrency("EURUSD", Direction.Buy)).toBe("EUR");
  });

  it("Sell EURUSD => dealt USD (terms)", () => {
    expect(deriveDealtCurrency("EURUSD", Direction.Sell)).toBe("USD");
  });

  it("Buy USDJPY => dealt USD (base)", () => {
    expect(deriveDealtCurrency("USDJPY", Direction.Buy)).toBe("USD");
  });

  it("Sell USDJPY => dealt JPY (terms)", () => {
    expect(deriveDealtCurrency("USDJPY", Direction.Sell)).toBe("JPY");
  });
});
