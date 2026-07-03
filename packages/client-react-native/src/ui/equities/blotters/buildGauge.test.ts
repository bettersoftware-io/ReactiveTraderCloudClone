import { describe, expect, it } from "vitest";

import {
  buildGaugePaths,
  GAUGE_CX,
  GAUGE_CY,
  GAUGE_R,
} from "#/ui/equities/blotters/buildGauge";

describe("buildGaugePaths", () => {
  it("draws the lower-semicircle track from left to right", () => {
    const { track } = buildGaugePaths(0, 1);
    expect(track).toBe(
      `M${(GAUGE_CX - GAUGE_R).toFixed(1)},${GAUGE_CY.toFixed(1)} A${GAUGE_R},${GAUGE_R} 0 0 0 ${(GAUGE_CX + GAUGE_R).toFixed(1)},${GAUGE_CY.toFixed(1)}`,
    );
  });
  it("returns a null fill at ~zero P&L and places the needle at bottom-centre", () => {
    const { fill, needleX, needleY } = buildGaugePaths(0, 1);
    expect(fill).toBeNull();
    expect(needleX).toBeCloseTo(GAUGE_CX, 5);
    expect(needleY).toBeCloseTo(GAUGE_CY + GAUGE_R, 5);
  });
  it("sweeps right for positive and left for negative P&L", () => {
    expect(buildGaugePaths(1, 1).fill).toContain(" 0 0 0 "); // fillSweep 0 (positive)
    expect(buildGaugePaths(-1, 1).fill).toContain(" 0 0 1 "); // fillSweep 1 (negative)
  });
});
