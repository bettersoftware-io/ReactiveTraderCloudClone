import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LatencySimulator } from "./LatencySimulator.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("LatencySimulator perturbation", () => {
  it("seed 1 baseline is a stable low-latency walk (golden)", async () => {
    const sim = new LatencySimulator(1);
    const p = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    const vals = (await p).map((s) => Math.round(s.value));
    expect(vals.every((v) => v < 80)).toBe(true);
  });

  it("perturb(latencySpike) raises the latency floor", async () => {
    const sim = new LatencySimulator(1);
    sim.perturb("latencySpike");
    const p = firstValueFrom(sim.latency$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    const vals = (await p).map((s) => s.value);
    expect(Math.max(...vals)).toBeGreaterThan(200);
  });
});
