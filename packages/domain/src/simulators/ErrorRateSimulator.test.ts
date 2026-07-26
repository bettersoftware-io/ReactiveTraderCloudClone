import { firstValueFrom } from "rxjs";
import { skip, take, toArray } from "rxjs/operators";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorRateSimulator } from "./ErrorRateSimulator.js";
import { METRIC_HISTORY_LEN, METRIC_TICK_MS } from "./metricWalk.js";

// Complements ErrorRateSimulator.golden.test.ts, which pins the seeded history
// window's exact values. Two things that window cannot reach: the LIVE tick
// past the backdated seed, and clearing a perturbation back to baseline (the
// golden file only ever perturbs).

beforeEach(() => {
  return vi.useFakeTimers();
});

afterEach(() => {
  return vi.useRealTimers();
});

describe("ErrorRateSimulator live ticks", () => {
  it("keeps emitting past the seeded history window", async () => {
    const sim = new ErrorRateSimulator(2);
    // seedHistory() replays METRIC_HISTORY_LEN samples synchronously on
    // subscribe; only sample 61+ comes from the interval, so anything taking
    // <= 60 (as the golden test does) never exercises the live branch at all.
    const pending = firstValueFrom(
      sim.errorRate$().pipe(skip(METRIC_HISTORY_LEN), take(2), toArray()),
    );

    await vi.advanceTimersByTimeAsync(METRIC_TICK_MS * 2);

    const live = await pending;

    expect(live).toHaveLength(2);

    for (const sample of live) {
      expect(sample.value).toBeGreaterThanOrEqual(0);
      expect(sample.value).toBeLessThanOrEqual(3);
      expect(sample.t).toBeTypeOf("number");
    }
  });

  it("stamps live samples one tick apart", async () => {
    const sim = new ErrorRateSimulator(2);
    const pending = firstValueFrom(
      sim.errorRate$().pipe(skip(METRIC_HISTORY_LEN), take(2), toArray()),
    );

    await vi.advanceTimersByTimeAsync(METRIC_TICK_MS * 2);

    const [first, second] = await pending;

    expect((second?.t ?? 0) - (first?.t ?? 0)).toBe(METRIC_TICK_MS);
  });
});

describe("ErrorRateSimulator clearPerturbation", () => {
  it("returns the walk to the calm baseline band", async () => {
    const sim = new ErrorRateSimulator(2);

    sim.perturb("errorBurst");
    expect(await firstSample(sim)).toBeGreaterThanOrEqual(5);

    sim.clearPerturbation();

    // The regime flip recenters rather than drifting, so the very next value
    // is already back in the baseline band — that recentring is exactly what
    // would break silently if clearPerturbation stopped resetting the subject.
    expect(await firstSample(sim)).toBeLessThanOrEqual(3);
  });

  it("is idempotent when nothing is perturbed", async () => {
    const sim = new ErrorRateSimulator(2);

    sim.clearPerturbation();
    sim.clearPerturbation();

    expect(await firstSample(sim)).toBeLessThanOrEqual(3);
  });
});

/** First value of a fresh subscription — the seeded history's oldest sample,
 * which reflects the regime in force at subscribe time. */
async function firstSample(sim: ErrorRateSimulator): Promise<number> {
  const sample = await firstValueFrom(sim.errorRate$().pipe(take(1)));

  return sample.value;
}
