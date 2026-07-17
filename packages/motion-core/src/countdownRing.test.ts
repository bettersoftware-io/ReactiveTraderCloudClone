import { describe, expect, it } from "vitest";

import {
  COUNTDOWN_URGENT_FRACTION,
  countdownProgress,
  ringCircumference,
  ringDashOffset,
} from "./countdownRing";

describe("countdownProgress (remaining fraction)", () => {
  it("is 1 at start, 0 at expiry, clamped", () => {
    expect(countdownProgress(1000, 1000)).toBe(1);
    expect(countdownProgress(0, 1000)).toBe(0);
    expect(countdownProgress(-50, 1000)).toBe(0);
    expect(countdownProgress(2000, 1000)).toBe(1);
    expect(countdownProgress(500, 1000)).toBeCloseTo(0.5, 5);
  });
  it("guards totalMs<=0", () => {
    expect(countdownProgress(500, 0)).toBe(0);
  });
});

describe("ring geometry", () => {
  it("circumference is 2πr", () => {
    expect(ringCircumference(10)).toBeCloseTo(2 * Math.PI * 10, 6);
  });
  it("dash offset is 0 when full, full circumference when empty", () => {
    const c = ringCircumference(10);
    expect(ringDashOffset(10, 1)).toBeCloseTo(0, 6);
    expect(ringDashOffset(10, 0)).toBeCloseTo(c, 6);
  });
  it("exposes an urgency threshold", () => {
    expect(COUNTDOWN_URGENT_FRACTION).toBeGreaterThan(0);
    expect(COUNTDOWN_URGENT_FRACTION).toBeLessThan(1);
  });
});
