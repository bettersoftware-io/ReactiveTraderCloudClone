import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricSample } from "../telemetry/metrics.js";
import { ErrorRateSimulator } from "./ErrorRateSimulator.js";
import { METRIC_HISTORY_LEN } from "./metricWalk.js";

beforeEach(() => {
  return vi.useFakeTimers();
});
afterEach(() => {
  return vi.useRealTimers();
});

describe("ErrorRateSimulator perturbation", () => {
  it("seed 2 baseline stays in the low band (golden)", async () => {
    const sim = new ErrorRateSimulator(2);
    const p = firstValueFrom(sim.errorRate$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    const vals = (await p).map((s) => {
      return s.value;
    });
    // Real seed-2 walk values: [0.435, 0.409, 0.377] — a calm band near the
    // 0.4% baseline center, well below 2%.
    expect(
      vals.every((v) => {
        return v < 2;
      }),
    ).toBe(true);
  });

  it("baseline walk is correlated: successive samples move by at most step/2 (0.075%)", async () => {
    const sim = new ErrorRateSimulator(2);
    const p = firstValueFrom(sim.errorRate$().pipe(take(20), toArray()));
    await vi.advanceTimersByTimeAsync(20_000);
    const vals = (await p).map((s) => {
      return s.value;
    });

    for (let i = 1; i < vals.length; i += 1) {
      expect(Math.abs(vals[i] - vals[i - 1])).toBeLessThanOrEqual(0.075);
    }
  });

  it("pre-seeds a full history window synchronously on subscribe, backdated 1s apart", () => {
    const sim = new ErrorRateSimulator(2);
    const collected: MetricSample[] = [];
    const sub = sim.errorRate$().subscribe((s) => {
      collected.push(s);
    });
    sub.unsubscribe();

    expect(collected).toHaveLength(METRIC_HISTORY_LEN);

    for (let i = 1; i < collected.length; i += 1) {
      expect(collected[i].t - collected[i - 1].t).toBe(1_000);
    }

    expect(collected[collected.length - 1].t).toBe(Date.now());
  });

  it("perturb(errorBurst) raises error rate into the high band (golden)", async () => {
    const sim = new ErrorRateSimulator(2);
    sim.perturb("errorBurst");
    const p = firstValueFrom(sim.errorRate$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    const vals = (await p).map((s) => {
      return s.value;
    });
    // Real burst walk values: [12.00 (recenter), 12.70, 12.18] — the burst
    // regime is clamped ≥5%, giving a clear gap vs the 2% baseline ceiling.
    expect(Math.max(...vals)).toBeGreaterThan(5);
  });
});
