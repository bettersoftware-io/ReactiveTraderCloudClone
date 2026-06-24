import { describe, expect, it } from "vitest";

import { loadGolden } from "../__testUtils__/loadGolden.js";
import { rfqResponseDelayMs } from "./PricingSimulator.js";

interface DelayCase {
  rand: number;
  expected: number;
}

describe("rfqResponseDelayMs (golden: rtc-original rfqs.ts:13)", () => {
  const golden = loadGolden<DelayCase>("rfqResponseDelayMs", import.meta.url);
  it.each(golden.cases as DelayCase[])("rand=$rand -> $expected ms", ({
    rand,
    expected,
  }) => {
    expect(rfqResponseDelayMs(rand)).toBe(expected);
  });
  it("never below 500 ms or above 999 ms", () => {
    for (let i = 0; i < 10_000; i++) {
      const d = rfqResponseDelayMs(Math.random());
      expect(d).toBeGreaterThanOrEqual(500);
      expect(d).toBeLessThanOrEqual(999);
    }
  });
});
