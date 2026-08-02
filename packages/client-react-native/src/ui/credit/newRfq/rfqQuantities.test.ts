import { describe, expect, it } from "vitest";

import { CREDIT_QUANTITY_MULTIPLIER } from "@rtc/domain";

import {
  millionsLabel,
  RFQ_QUANTITY_CHIPS,
} from "#/ui/credit/newRfq/rfqQuantities";

describe("RFQ_QUANTITY_CHIPS", () => {
  // THE BUG THIS FILE EXISTS FOR. `CreateRfqUseCase` multiplies its input by
  // CREDIT_QUANTITY_MULTIPLIER, so the chips must carry UI-scale values. They
  // originally carried the prototype's notional ones (1_000_000 …), and
  // selecting "1M" on device produced an RFQ for 1,000,000,000.
  it("carries UI-scale values that the use case scales into millions", () => {
    for (const chip of RFQ_QUANTITY_CHIPS) {
      const notional = chip * CREDIT_QUANTITY_MULTIPLIER;
      expect(notional).toBeGreaterThanOrEqual(1_000_000);
      expect(notional % 1_000_000).toBe(0);
    }
  });

  it("offers the prototype's four clip sizes, in order", () => {
    const notionals = RFQ_QUANTITY_CHIPS.map((c) => {
      return c * CREDIT_QUANTITY_MULTIPLIER;
    });

    expect(notionals).toEqual([1_000_000, 2_000_000, 5_000_000, 10_000_000]);
  });
});

describe("millionsLabel", () => {
  // The label names the notional the desk is broadcasting, NOT the raw UI-scale
  // number the seam happens to take — "1M" must mean a million.
  it("labels each chip by the notional it produces", () => {
    expect(RFQ_QUANTITY_CHIPS.map(millionsLabel)).toEqual([
      "1M",
      "2M",
      "5M",
      "10M",
    ]);
  });
});
