// TDD — RED: written before adminKpisVm existed.
//   pnpm --filter @rtc/client-core test -- adminKpisVm  → FAIL (module missing)
// GREEN: adminKpisVm created → all cases pass.

import { describe, expect, it } from "vitest";

import type { MetricSample } from "@rtc/domain";

import {
  kpisVm,
  latencyBuckets,
  smoothPath,
  sparkPath,
  throughputPaths,
} from "../adminKpisVm";

describe("smoothPath", () => {
  it("emits a Catmull-Rom cubic-Bézier path through every data point", () => {
    const d = smoothPath(
      [
        { x: 0, y: 28 },
        { x: 50, y: 15 },
        { x: 100, y: 2 },
      ],
      28,
    );
    expect(d).toBe(
      "M0.0,28.0 C8.3,25.8 33.3,19.3 50.0,15.0 C66.7,10.7 91.7,4.2 100.0,2.0",
    );
  });

  it("clamps control-point y into [0, boxHeight] so sharp turns never overshoot the box", () => {
    // A flat-bottomed V: unclamped Catmull-Rom control points at the two
    // bottom corners would dip to y≈32.3 in a 28-high box.
    const d = smoothPath(
      [
        { x: 0, y: 2 },
        { x: 100 / 3, y: 28 },
        { x: 200 / 3, y: 28 },
        { x: 100, y: 2 },
      ],
      28,
    );

    const ys = [...d.matchAll(/,(-?\d+\.\d)/g)].map((m) => {
      return Number(m[1]);
    });
    expect(Math.max(...ys)).toBeLessThanOrEqual(28);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });

  it("collapses a single point to a bare moveto", () => {
    expect(smoothPath([{ x: 0, y: 28 }], 28)).toBe("M0.0,28.0");
  });

  it("returns an empty string for no points", () => {
    expect(smoothPath([], 28)).toBe("");
  });
});

describe("sparkPath", () => {
  it("normalises a series into an inverted smoothed path over the 100×28 box", () => {
    expect(sparkPath([10, 20, 30])).toBe(
      "M0.0,28.0 C8.3,25.8 33.3,19.3 50.0,15.0 C66.7,10.7 91.7,4.2 100.0,2.0",
    );
  });

  it("collapses a single-value series to the origin without NaN", () => {
    expect(sparkPath([5])).toBe("M0.0,28.0");
  });

  it("returns an empty string for an empty series", () => {
    expect(sparkPath([])).toBe("");
  });

  it("renders a flat series at the box bottom (no divide-by-zero range)", () => {
    expect(sparkPath([7, 7, 7])).toBe(
      "M0.0,28.0 C8.3,28.0 33.3,28.0 50.0,28.0 C66.7,28.0 91.7,28.0 100.0,28.0",
    );
  });
});

describe("kpisVm", () => {
  it("formats throughput, latency, error-rate and sessions per prototype rules", () => {
    const input = {
      throughput: series([
        1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 2000,
      ]),
      latency: series([30, 30, 30, 30, 30, 30, 30, 30, 30, 40]),
      errorRate: series([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5]),
      sessions: series([100, 100, 100, 100, 100, 100, 100, 100, 100, 120]),
    };
    const vms = kpisVm(input);

    expect(
      vms.map((v) => {
        return v.key;
      }),
    ).toEqual(["tput", "lat", "err", "sess"]);

    const tput = vms[0];
    expect(tput.label).toBe("Throughput");
    expect(tput.unit).toBe("k msg/s");
    expect(tput.value).toBe("2.00"); // (2000/1000).toFixed(2)
    expect(tput.deltaUp).toBe(true);
    expect(tput.delta).toBe("▲ +1.00"); // 2000 - 1000(9-back)
    expect(tput.warn).toBe(false);

    const lat = vms[1];
    expect(lat.unit).toBe("ms");
    expect(lat.value).toBe("40");
    expect(lat.delta).toBe("▲ +10");
    expect(lat.warn).toBe(false); // 40 <= 60

    const err = vms[2];
    expect(err.unit).toBe("%");
    expect(err.value).toBe("0.50");
    expect(err.delta).toBe("▲ +0.40");
    expect(err.warn).toBe(false); // 0.5 <= 0.8

    const sess = vms[3];
    expect(sess.unit).toBe("");
    expect(sess.value).toBe("120");
    expect(sess.delta).toBe("▲ +20");
  });

  it("flags a delta decrease with the down arrow and unsigned magnitude", () => {
    const decreasing = series([50, 50, 50, 50, 50, 50, 50, 50, 50, 30]);
    const vms = kpisVm({
      throughput: [],
      latency: decreasing,
      errorRate: [],
      sessions: [],
    });
    const lat = vms[1];
    expect(lat.deltaUp).toBe(false);
    expect(lat.delta).toBe("▼ 20"); // |30 - 50|
  });

  it("warns on latency strictly above 60ms, not at the boundary", () => {
    const atBoundary = kpisVm({
      throughput: [],
      latency: series([60]),
      errorRate: [],
      sessions: [],
    })[1];
    expect(atBoundary.warn).toBe(false);

    const overBoundary = kpisVm({
      throughput: [],
      latency: series([61]),
      errorRate: [],
      sessions: [],
    })[1];
    expect(overBoundary.warn).toBe(true);
  });

  it("warns on error rate strictly above 0.8%, not at the boundary", () => {
    const atBoundary = kpisVm({
      throughput: [],
      latency: [],
      errorRate: series([0.8]),
      sessions: [],
    })[2];
    expect(atBoundary.warn).toBe(false);

    const overBoundary = kpisVm({
      throughput: [],
      latency: [],
      errorRate: series([0.81]),
      sessions: [],
    })[2];
    expect(overBoundary.warn).toBe(true);
  });

  it("reads as a flat zero with no NaN when every series is empty", () => {
    const vms = kpisVm({
      throughput: [],
      latency: [],
      errorRate: [],
      sessions: [],
    });

    for (const vm of vms) {
      expect(vm.value).not.toContain("NaN");
      expect(vm.delta).not.toContain("NaN");
      expect(vm.spark).toBe("");
      expect(vm.warn).toBe(false);
    }

    expect(vms[0].value).toBe("0.00");
    expect(vms[1].value).toBe("0");
    expect(vms[2].value).toBe("0.00");
    expect(vms[3].value).toBe("0");
    expect(
      vms.every((v) => {
        return v.deltaUp;
      }),
    ).toBe(true);
  });

  it("falls back to the earliest sample when the series is shorter than the lookback", () => {
    // length 3 < DELTA_LOOKBACK(9) → past falls back to arr[0]
    const vms = kpisVm({
      throughput: [],
      latency: series([10, 20, 30]),
      errorRate: [],
      sessions: [],
    });
    const lat = vms[1];
    expect(lat.delta).toBe("▲ +20"); // 30 - 10 (arr[0])
  });
});

describe("throughputPaths", () => {
  it("builds a 300×96 smoothed line path plus a closed gradient area", () => {
    const paths = throughputPaths(series([600, 1200, 2200]));
    expect(paths.line).toBe(
      "M0.0,92.0 C25.0,86.8 100.0,74.5 150.0,60.5 C200.0,46.5 275.0,16.8 300.0,8.0",
    );
    expect(paths.area).toBe(`${paths.line} L300,96 L0,96 Z`);
  });

  it("closes to a flat baseline for an empty series", () => {
    const paths = throughputPaths([]);
    expect(paths.line).toBe("");
    expect(paths.area).toBe("M0,96 L300,96 Z");
  });

  it("collapses a single-value series to the origin without NaN", () => {
    const paths = throughputPaths(series([1000]));
    expect(paths.line).toBe("M0.0,92.0");
    expect(paths.area).toBe("M0.0,92.0 L300,96 L0,96 Z");
  });
});

describe("latencyBuckets", () => {
  it("assigns the 6 fixed labels in order", () => {
    const buckets = latencyBuckets([]);
    expect(
      buckets.map((b) => {
        return b.label;
      }),
    ).toEqual(["<10", "10-25", "25-50", "50-80", "80-150", "150+"]);
  });

  it("lands boundary values in the lower bucket", () => {
    const buckets = latencyBuckets(series([10, 25, 50, 80, 150, 151]));
    const counts = buckets.map((b) => {
      return Math.round((b.heightPct / 100) * 1);
    });
    // Each boundary value should land exactly once, in its lower bucket:
    // <10 gets 10, 10-25 gets 25, 25-50 gets 50, 50-80 gets 80, 80-150 gets 150, 150+ gets 151.
    expect(counts).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("computes heightPct relative to the max bucket count and flags the modal bucket", () => {
    const samples = series([
      5, // <10 (1)
      12,
      13,
      14, // 10-25 (3) — modal
      30, // 25-50 (1)
    ]);
    const buckets = latencyBuckets(samples);
    expect(buckets[0].heightPct).toBeCloseTo((1 / 3) * 100);
    expect(buckets[1].heightPct).toBe(100);
    expect(buckets[1].accent).toBe(true);
    expect(buckets[2].heightPct).toBeCloseTo((1 / 3) * 100);
    expect(
      buckets.filter((b) => {
        return b.accent;
      }),
    ).toHaveLength(1);
  });

  it("has no accent bucket and zero heights for an empty series", () => {
    const buckets = latencyBuckets([]);

    for (const b of buckets) {
      expect(b.heightPct).toBe(0);
      expect(b.accent).toBe(false);
    }
  });
});

function series(values: readonly number[]): readonly MetricSample[] {
  return values.map((value, i) => {
    return { t: i, value };
  });
}
