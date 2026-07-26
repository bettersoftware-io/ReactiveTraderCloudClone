import { describe, expect, it } from "vitest";

import type { ChartViewport } from "./chartViewport.js";
import { Y_SPAN, Y_TOP } from "./chartVm.js";
import { indicatorPoints, indicatorValues } from "./indicatorSeries.js";

describe("indicatorValues", () => {
  it("SMA of a constant series is that constant from index window-1 onward, null before it", () => {
    const closes = Array.from({ length: 25 }, () => {
      return 7;
    });
    const values = indicatorValues(closes, "sma20");

    for (let i = 0; i < 19; i++) {
      expect(values[i]).toBeNull();
    }

    for (let i = 19; i < 25; i++) {
      expect(values[i]).toBeCloseTo(7, 10);
    }
  });

  it("SMA window arithmetic on a known ramp (closes 1..25)", () => {
    const closes = Array.from({ length: 25 }, (_, i) => {
      return i + 1;
    });
    const values = indicatorValues(closes, "sma20");

    expect(values[19]).toBeCloseTo(10.5, 10);
    expect(values[24]).toBeCloseTo(15.5, 10);
  });

  it("seeds the EMA at index window-1 with the SMA of the first `window` closes", () => {
    const closes = Array.from({ length: 55 }, (_, i) => {
      return i + 1;
    });
    const values = indicatorValues(closes, "ema50");
    const seedMean =
      closes.slice(0, 50).reduce((sum, c) => {
        return sum + c;
      }, 0) / 50;

    expect(values[48]).toBeNull();
    expect(values[49]).toBeCloseTo(seedMean, 10);
  });

  it("k-weights the EMA tail past the seed (hand-computed 3-value tail)", () => {
    // First 50 closes constant at 10 (seed = 10), then three moves: 12, 14, 16.
    // k = 2/51. Reference values computed independently from the spec's
    // recurrence (ema = close*k + prev*(1-k)):
    //   ema[50] = 10.07843137254902
    //   ema[51] = 10.232218377547097
    //   ema[52] = 10.458405892153094
    const closes = [
      ...Array.from({ length: 50 }, () => {
        return 10;
      }),
      12,
      14,
      16,
    ];
    const values = indicatorValues(closes, "ema50");

    expect(values[49]).toBeCloseTo(10, 10);
    expect(values[50]).toBeCloseTo(10.07843137254902, 10);
    expect(values[51]).toBeCloseTo(10.232218377547097, 10);
    expect(values[52]).toBeCloseTo(10.458405892153094, 10);
  });

  it("stays null for every index when the series is shorter than the window", () => {
    const closes = Array.from({ length: 10 }, (_, i) => {
      return i + 1;
    });
    const values = indicatorValues(closes, "sma20");

    expect(
      values.every((v) => {
        return v === null;
      }),
    ).toBe(true);
    expect(values.length).toBe(10);
  });

  it("returns an empty array for an empty series", () => {
    expect(indicatorValues([], "sma20")).toEqual([]);
  });
});

describe("indicatorPoints", () => {
  it("skips null warm-up values, producing no points", () => {
    const closes = Array.from({ length: 10 }, (_, i) => {
      return i + 1;
    });
    const values = indicatorValues(closes, "sma20");
    const viewport: ChartViewport = { start: 0, end: 10 };

    expect(indicatorPoints(values, viewport, { cmin: 0, cmax: 10 })).toEqual(
      [],
    );
  });

  it("maps points using the passed scale, the same x/y formula as chartVm", () => {
    const closes = Array.from({ length: 25 }, (_, i) => {
      return i + 1;
    });
    const values = indicatorValues(closes, "sma20");
    const viewport: ChartViewport = { start: 0, end: 25 };
    const scale = { cmin: 0, cmax: 20 };

    const points = indicatorPoints(values, viewport, scale);

    expect(points.length).toBe(6); // indices 19..24
    const first = points[0];
    expect(first?.x).toBeCloseTo(((19.5 - 0) / 25) * 100, 10);
    expect(first?.y).toBeCloseTo(((20 - 10.5) / 20) * Y_SPAN + Y_TOP, 10);
  });

  it("only includes indices intersecting [floor(start), ceil(end)-1]", () => {
    const closes = Array.from({ length: 25 }, (_, i) => {
      return i + 1;
    });
    const values = indicatorValues(closes, "sma20");
    // Non-null indices are 19..24; a viewport of [20, 23) should only see 20, 21, 22.
    const viewport: ChartViewport = { start: 20, end: 23 };
    const scale = { cmin: 0, cmax: 20 };

    const points = indicatorPoints(values, viewport, scale);

    expect(points.length).toBe(3);
  });
});
