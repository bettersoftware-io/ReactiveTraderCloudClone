import { firstValueFrom } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorRateSimulator } from "./ErrorRateSimulator.js";

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
    // Real observed: [0.734, 0.325, 0.285] — all well below 2%
    expect(
      vals.every((v) => {
        return v < 2;
      }),
    ).toBe(true);
  });

  it("perturb(errorBurst) raises error rate into the high band (golden)", async () => {
    const sim = new ErrorRateSimulator(2);
    sim.perturb("errorBurst");
    const p = firstValueFrom(sim.errorRate$().pipe(take(3), toArray()));
    await vi.advanceTimersByTimeAsync(3_000);
    const vals = (await p).map((s) => {
      return s.value;
    });
    // Real observed: [16.81, 11.90, 11.42] — all above 8%; floor 5 gives clear gap vs baseline ceiling 2
    expect(Math.max(...vals)).toBeGreaterThan(5);
  });
});
