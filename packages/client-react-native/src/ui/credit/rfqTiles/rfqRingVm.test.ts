import { describe, expect, it } from "vitest";

import { ringCircumference } from "@rtc/motion-core";

import { RFQ_RING_RADIUS, rfqRingVm } from "#/ui/credit/rfqTiles/rfqRingVm";

describe("rfqRingVm", () => {
  it("is a full ring at full remaining time", () => {
    expect(rfqRingVm(60_000, 60_000).dashOffset).toBeCloseTo(0, 5);
  });

  it("is an empty ring at zero remaining", () => {
    expect(rfqRingVm(0, 60_000).dashOffset).toBeCloseTo(
      ringCircumference(RFQ_RING_RADIUS),
      5,
    );
  });

  it("flips to urgent under ten seconds", () => {
    expect(rfqRingVm(10_001, 60_000).isUrgent).toBe(false);
    expect(rfqRingVm(9_999, 60_000).isUrgent).toBe(true);
  });

  it("clamps a negative remaining to empty rather than overshooting", () => {
    expect(rfqRingVm(-5_000, 60_000).dashOffset).toBeCloseTo(
      ringCircumference(RFQ_RING_RADIUS),
      5,
    );
  });

  it("treats a zero total as expired instead of dividing by zero", () => {
    expect(Number.isFinite(rfqRingVm(0, 0).dashOffset)).toBe(true);
  });
});
