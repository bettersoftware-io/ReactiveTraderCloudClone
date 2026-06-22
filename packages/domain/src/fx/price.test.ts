import { describe, expect, it } from "vitest";

import { calculateSpread, detectMovement, PriceMovementType } from "./price.js";

describe("calculateSpread", () => {
  it("computes EURUSD spread (ratePrecision=5, pipsPosition=4)", () => {
    // ask = 1.53834, bid = 1.53816 => spread = 0.00018 * 10^4 = 1.8
    const result = calculateSpread(1.53816, 1.53834, 4, 5);
    expect(result).toBe("1.8");
  });

  it("computes USDJPY spread (ratePrecision=3, pipsPosition=2)", () => {
    // ask = 110.523, bid = 110.501 => spread = 0.022 * 10^2 = 2.2
    const result = calculateSpread(110.501, 110.523, 2, 3);
    expect(result).toBe("2.2");
  });

  it("handles zero spread", () => {
    const result = calculateSpread(1.5, 1.5, 4, 5);
    expect(result).toBe("0.0");
  });
});

describe("detectMovement", () => {
  it("returns NONE for first tick (no previous)", () => {
    expect(detectMovement(1.5, undefined)).toBe(PriceMovementType.NONE);
  });

  it("returns UP when mid increases", () => {
    expect(detectMovement(1.51, 1.5)).toBe(PriceMovementType.UP);
  });

  it("returns DOWN when mid decreases", () => {
    expect(detectMovement(1.49, 1.5)).toBe(PriceMovementType.DOWN);
  });

  it("returns DOWN when mid equals previous (equal defaults to DOWN)", () => {
    expect(detectMovement(1.5, 1.5)).toBe(PriceMovementType.DOWN);
  });
});
