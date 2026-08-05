import { describe, expect, it } from "vitest";

import { priceTicks } from "./priceTicks.js";

describe("priceTicks", () => {
  it("picks the spec's worked example: 339→400 steps by 20", () => {
    expect(priceTicks(339, 400)).toEqual([340, 360, 380, 400]);
  });

  it("threshold-rounds instead of snapping up (the 1-tick regression case)", () => {
    // rawStep = 8.5/4 = 2.125; snap-up would pick 5 → ONE tick (105).
    // Threshold: err 2.125 ∈ [√2, √10) → multiplier 2 → step 2.
    expect(priceTicks(101, 109.5)).toEqual([102, 104, 106, 108]);
  });

  it("handles fractional steps below 1", () => {
    // rawStep = 2/4 = 0.5; err 5 ∈ [√10, √50) → 5 → step 0.5.
    expect(priceTicks(10, 12)).toEqual([10, 10.5, 11, 11.5, 12]);
  });

  it("includes endpoints when they are exact multiples", () => {
    // rawStep 25; err 2.5 → multiplier 2 → step 20:
    expect(priceTicks(100, 200)).toEqual([100, 120, 140, 160, 180, 200]);
  });

  it("boundary alignment can cost a tick — the hard floor is 2 (spec §3)", () => {
    // rawStep 7.15; err 7.15 ≥ √50 → step 10; only 400 and 410 fit.
    expect(priceTicks(390.4, 419)).toEqual([400, 410]);
  });

  it("keeps the count in the hard bounds [2, 7] across a range sweep", () => {
    for (let i = 0; i < 200; i++) {
      const cmin = 50 + i * 3.7;
      const span = 1 + (i % 40) * 2.3;
      const ticks = priceTicks(cmin, cmin + span);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(7);
    }
  });

  it("emits exact multiples of the step (no accumulation drift)", () => {
    for (const t of priceTicks(339, 400)) {
      expect(t % 20).toBe(0);
    }
  });

  it("degenerate range returns [cmin]", () => {
    expect(priceTicks(100, 100)).toEqual([100]);
    expect(priceTicks(100, 90)).toEqual([100]);
  });
});
