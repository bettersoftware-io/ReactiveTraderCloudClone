import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LatencySimulator } from "./LatencySimulator.js";

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
    expect(
      vals.every((v) => {
        return v < 80;
      }),
    ).toBe(true);
  });

  it("perturb(latencySpike) raises the latency floor", async () => {
    const sim = new LatencySimulator(1);
    sim.perturb("latencySpike");
    const p = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    const vals = (await p).map((s) => {
      return s.value;
    });
    expect(Math.max(...vals)).toBeGreaterThan(200);
  });

  it("clearPerturbation() reverts latency to baseline band after a spike (golden)", async () => {
    const sim = new LatencySimulator(1);
    sim.perturb("latencySpike");
    const p1 = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    // Real spike values: [450.83, 201.09, 410.98] — confirm we were in the high band
    const spikedVals = (await p1).map((s) => {
      return s.value;
    });
    expect(Math.max(...spikedVals)).toBeGreaterThan(200);

    // Clear and observe a fresh subscription: stream returns to baseline
    sim.clearPerturbation();
    const p2 = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    // Real values after clear: [29.53, 29.21, 12.03] — all in baseline band < 80
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
