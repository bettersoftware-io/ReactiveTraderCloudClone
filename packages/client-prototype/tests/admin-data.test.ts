import { describe, expect, test } from "vitest";

import {
  gs,
  METRIC_CFG,
  METRIC_KEYS,
  SERIES_LEN,
  seedLatBars,
  seedMetrics,
  stepMetrics,
  stepSeries,
} from "#/admin/adminData";
import { mulberry32 } from "#/mock/rng";

describe("adminData", () => {
  test("gs generates a walk of length n, never below zero", () => {
    const arr = gs(48, 1200, 160, mulberry32(1));
    expect(arr).toHaveLength(48);
    expect(Math.min(...arr)).toBeGreaterThanOrEqual(0);
  });

  test("seedMetrics returns a SERIES_LEN-long series per metric key", () => {
    const m = seedMetrics(mulberry32(2));

    for (const key of METRIC_KEYS) {
      expect(m[key]).toHaveLength(SERIES_LEN);
    }
  });

  test("stepSeries drops the oldest sample and appends one in [min,max]", () => {
    const arr = gs(48, 42, 9, mulberry32(3));
    const next = stepSeries(arr, 7, 8, 90, mulberry32(4));
    expect(next).toHaveLength(48);
    expect(next.slice(0, 47)).toEqual(arr.slice(1));
    const appended = next[next.length - 1];
    expect(appended).toBeGreaterThanOrEqual(8);
    expect(appended).toBeLessThanOrEqual(90);
  });

  test("stepMetrics advances every series and clamps to its config bounds", () => {
    let m = seedMetrics(mulberry32(5));
    const rng = mulberry32(6);

    for (let i = 0; i < 200; i += 1) {
      m = stepMetrics(m, rng);
    }

    for (const key of METRIC_KEYS) {
      const cfg = METRIC_CFG[key];
      const last = m[key][m[key].length - 1];
      expect(last).toBeGreaterThanOrEqual(cfg.min);
      expect(last).toBeLessThanOrEqual(cfg.max);
    }
  });

  test("seedLatBars is deterministic under a seeded RNG and flags bucket 2 as accent", () => {
    const bars = seedLatBars(mulberry32(7));
    const again = seedLatBars(mulberry32(7));
    expect(bars).toHaveLength(6);
    expect(bars).toEqual(again);
    expect(bars[2].accent).toBe(true);
    expect(
      bars.every((b) => {
        return b.heightPct >= 4;
      }),
    ).toBe(true);
  });
});
