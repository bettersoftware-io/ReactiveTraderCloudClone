import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricSample } from "../telemetry/metrics.js";
import { LatencySimulator } from "./LatencySimulator.js";
import { METRIC_HISTORY_LEN } from "./metricWalk.js";

beforeEach(() => {
  return vi.useFakeTimers();
});
afterEach(() => {
  return vi.useRealTimers();
});

describe("LatencySimulator perturbation", () => {
  it("seed 1 baseline is a stable low-latency walk (golden)", async () => {
    const sim = new LatencySimulator(1);
    const p = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    const vals = (await p).map((s) => {
      return Math.round(s.value);
    });
    // Real seed-1 walk values: [42.76, 39.78, 39.94] — a calm band near the
    // 42ms baseline center.
    expect(
      vals.every((v) => {
        return v < 80;
      }),
    ).toBe(true);
  });

  it("baseline walk is correlated: successive samples move by at most step/2 (3ms)", async () => {
    const sim = new LatencySimulator(1);
    const p = firstValueFrom(sim.latency$().pipe(take(20), toArray()));
    await vi.advanceTimersByTimeAsync(20_000);
    const vals = (await p).map((s) => {
      return s.value;
    });

    for (let i = 1; i < vals.length; i += 1) {
      expect(Math.abs(vals[i] - vals[i - 1])).toBeLessThanOrEqual(3);
    }
  });

  it("pre-seeds a full history window synchronously on subscribe, backdated 1s apart", () => {
    const sim = new LatencySimulator(1);
    const collected: MetricSample[] = [];
    const sub = sim.latency$().subscribe((s) => {
      collected.push(s);
    });
    sub.unsubscribe();

    expect(collected).toHaveLength(METRIC_HISTORY_LEN);

    for (let i = 1; i < collected.length; i += 1) {
      expect(collected[i].t - collected[i - 1].t).toBe(1_000);
    }

    expect(collected[collected.length - 1].t).toBe(Date.now());
  });

  it("perturb(latencySpike) raises the latency floor", async () => {
    const sim = new LatencySimulator(1);
    sim.perturb("latencySpike");
    const p = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    const vals = (await p).map((s) => {
      return s.value;
    });
    // Real spike walk values: [400.00 (recenter), 410.17, 370.38] — the spike
    // regime is clamped ≥220ms, so every sample clears the 200ms bar.
    expect(Math.max(...vals)).toBeGreaterThan(200);
  });

  it("clearPerturbation() reverts latency to baseline band after a spike (golden)", async () => {
    const sim = new LatencySimulator(1);
    sim.perturb("latencySpike");
    const p1 = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    // Confirm we were in the high band first
    const spikedVals = (await p1).map((s) => {
      return s.value;
    });
    expect(Math.max(...spikedVals)).toBeGreaterThan(200);

    // Clear and observe a fresh subscription: stream recenters on baseline
    sim.clearPerturbation();
    const p2 = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    // Real values after clear: [42.00 (recenter), 44.51, 46.52] — all in the
    // baseline band < 80.
    const clearedVals = (await p2).map((s) => {
      return s.value;
    });
    expect(
      clearedVals.every((v) => {
        return v < 80;
      }),
    ).toBe(true);
  });
});
