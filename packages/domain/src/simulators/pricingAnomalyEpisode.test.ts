import { from } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import type { PriceTick } from "../fx/price.js";
import {
  DEFAULT_ANOMALY_CONFIG,
  detectAnomalies,
} from "../jarvis/anomalyDetector.js";
import {
  advanceEpisode,
  burstSignBias,
  burstStepMultiplier,
  DEFAULT_EPISODE_CONFIG,
  type EpisodeConfig,
  type EpisodeState,
  NO_EPISODE,
  spreadFactor,
} from "./pricingAnomalyEpisode.js";

/** A scripted RNG: each call returns the next value from `values`, cycling if exhausted. Throws if `values` is empty and it's ever called — a test bug, not a domain bug. */
function scriptedRandom(values: readonly number[]): {
  readonly random: () => number;
  readonly callCount: () => number;
} {
  let i = 0;
  return {
    random: () => {
      if (values.length === 0) {
        throw new Error("scriptedRandom: no values scripted");
      }
      const v = values[i % values.length];
      i += 1;
      return v;
    },
    callCount: () => i,
  };
}

describe("advanceEpisode", () => {
  it("steady state: a roll that misses startProbability leaves the state unchanged and consumes exactly one draw", () => {
    const { random, callCount } = scriptedRandom([0.9]);
    const next = advanceEpisode(NO_EPISODE, random, DEFAULT_EPISODE_CONFIG);
    expect(next).toBe(NO_EPISODE);
    expect(callCount()).toBe(1);
  });

  it("byte-compatible steady state: startProbability forced to 0 draws ZERO values from random, for any random sequence and any number of ticks", () => {
    const config: EpisodeConfig = {
      ...DEFAULT_EPISODE_CONFIG,
      startProbability: 0,
    };
    // A sequence that WOULD start an episode under any positive probability
    // (every value is 0 — always "wins" the roll) — proving the short-circuit,
    // not merely that these particular values happened not to cross a threshold.
    const { random, callCount } = scriptedRandom([0, 0, 0, 0, 0]);

    let state = NO_EPISODE;
    for (let tick = 0; tick < 50; tick++) {
      state = advanceEpisode(state, random, config);
    }

    expect(state).toBe(NO_EPISODE);
    expect(callCount()).toBe(0);
  });

  it("a roll that clears startProbability starts an episode, drawing duration, kind, peak factor, and sign-persistence in order", () => {
    // random() < startProbability (1/1500) needs a very small first value.
    const { random } = scriptedRandom([
      0, // start roll: 0 < 1/1500 → starts
      0.5, // duration: min + 0.5*(max-min) = 20 + 0.5*40 = 40
      0.2, // kind: < 0.5 → spreadWidening
      0.25, // peakFactor: 2 + 0.25*(4-2) = 2.5
    ]);
    const next = advanceEpisode(NO_EPISODE, random, DEFAULT_EPISODE_CONFIG);

    expect(next.kind).toBe("spreadWidening");
    expect(next.duration).toBe(40);
    expect(next.ticksRemaining).toBe(40);
    expect(next.peakFactor).toBeCloseTo(2.5, 10);
    expect(next.signBias).toBe(0);
  });

  it("a volBurst start additionally rolls sign persistence and, when persistent, the sign itself", () => {
    const { random } = scriptedRandom([
      0, // start roll
      0, // duration: min
      0.9, // kind: >= 0.5 → volBurst
      0.5, // peakFactor: 4 + 0.5*(8-4) = 6
      0.1, // signPersistProbability roll: 0.1 < 0.5 → persists
      0.9, // sign: >= 0.5 → +1
    ]);
    const next = advanceEpisode(NO_EPISODE, random, DEFAULT_EPISODE_CONFIG);

    expect(next.kind).toBe("volBurst");
    expect(next.peakFactor).toBeCloseTo(6, 10);
    expect(next.signBias).toBe(1);
  });

  it("a volBurst start that misses sign persistence leaves signBias at 0 (per-tick random sign)", () => {
    const { random } = scriptedRandom([
      0, // start roll
      0, // duration
      0.9, // kind → volBurst
      0.5, // peakFactor
      0.9, // signPersistProbability roll: 0.9 >= 0.5 → does NOT persist
    ]);
    const next = advanceEpisode(NO_EPISODE, random, DEFAULT_EPISODE_CONFIG);

    expect(next.kind).toBe("volBurst");
    expect(next.signBias).toBe(0);
  });

  it("duration is bounded by [minDurationTicks, maxDurationTicks] at both roll extremes", () => {
    const atMin = advanceEpisode(
      NO_EPISODE,
      scriptedRandom([0, 0, 0.9, 0]).random,
      DEFAULT_EPISODE_CONFIG,
    );
    expect(atMin.duration).toBe(DEFAULT_EPISODE_CONFIG.minDurationTicks);

    const atMax = advanceEpisode(
      NO_EPISODE,
      scriptedRandom([0, 0.999999999, 0.9, 0]).random,
      DEFAULT_EPISODE_CONFIG,
    );
    expect(atMax.duration).toBe(DEFAULT_EPISODE_CONFIG.maxDurationTicks);
  });

  it("peakFactor is bounded by the kind's configured range at both roll extremes", () => {
    const spreadMin = advanceEpisode(
      NO_EPISODE,
      scriptedRandom([0, 0, 0.1, 0]).random,
      DEFAULT_EPISODE_CONFIG,
    );
    expect(spreadMin.peakFactor).toBeCloseTo(
      DEFAULT_EPISODE_CONFIG.spreadPeakRange[0],
      10,
    );

    const spreadMax = advanceEpisode(
      NO_EPISODE,
      scriptedRandom([0, 0, 0.1, 0.999999999]).random,
      DEFAULT_EPISODE_CONFIG,
    );
    expect(spreadMax.peakFactor).toBeCloseTo(
      DEFAULT_EPISODE_CONFIG.spreadPeakRange[1],
      6,
    );

    const burstMax = advanceEpisode(
      NO_EPISODE,
      scriptedRandom([0, 0, 0.9, 0.999999999, 0.9]).random,
      DEFAULT_EPISODE_CONFIG,
    );
    expect(burstMax.peakFactor).toBeCloseTo(
      DEFAULT_EPISODE_CONFIG.burstPeakRange[1],
      6,
    );
  });

  it("decays tick by tick back to NO_EPISODE after exactly `duration` active ticks, consuming no further randomness", () => {
    const duration = 5;
    let state: EpisodeState = {
      kind: "spreadWidening",
      ticksRemaining: duration,
      duration,
      peakFactor: 3,
      signBias: 0,
    };
    const { random, callCount } = scriptedRandom([0.5]); // never consulted once kind !== "none"

    const seenKinds: string[] = [state.kind];
    for (let tick = 0; tick < duration; tick++) {
      state = advanceEpisode(state, random, DEFAULT_EPISODE_CONFIG);
      seenKinds.push(state.kind);
    }

    // duration=5 active ticks (the initial one plus 4 decrements) then reverts.
    expect(seenKinds).toEqual([
      "spreadWidening",
      "spreadWidening",
      "spreadWidening",
      "spreadWidening",
      "spreadWidening",
      "none",
    ]);
    expect(state).toBe(NO_EPISODE);
    expect(callCount()).toBe(0);
  });
});

describe("spreadFactor", () => {
  it("is 1 for none and volBurst states — only spreadWidening ramps the spread", () => {
    expect(spreadFactor(NO_EPISODE)).toBe(1);
    expect(
      spreadFactor({
        kind: "volBurst",
        ticksRemaining: 10,
        duration: 20,
        peakFactor: 6,
        signBias: 1,
      }),
    ).toBe(1);
  });

  it("ramps from 1 at the episode's start, up through a peak near the midpoint, back to ~1 at the episode's end", () => {
    const duration = 21;
    const peakFactor = 4;
    const factors: number[] = [];
    for (let ticksRemaining = duration; ticksRemaining >= 1; ticksRemaining--) {
      factors.push(
        spreadFactor({
          kind: "spreadWidening",
          ticksRemaining,
          duration,
          peakFactor,
          signBias: 0,
        }),
      );
    }

    expect(factors[0]).toBeCloseTo(1, 9);
    expect(factors.at(-1)).toBeCloseTo(1, 9);

    const midIndex = Math.floor((duration - 1) / 2);
    expect(factors[midIndex]).toBeCloseTo(peakFactor, 6);

    // Monotonically increasing through the first half, decreasing through the second.
    for (let i = 1; i <= midIndex; i++) {
      expect(factors[i]).toBeGreaterThanOrEqual(factors[i - 1]);
    }
    for (let i = midIndex + 1; i < factors.length; i++) {
      expect(factors[i]).toBeLessThanOrEqual(factors[i - 1]);
    }

    // Never dips below the resting 1x nor exceeds the configured peak.
    for (const f of factors) {
      expect(f).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(f).toBeLessThanOrEqual(peakFactor + 1e-9);
    }
  });
});

describe("burstStepMultiplier / burstSignBias", () => {
  it("are neutral (1, 0) for none and spreadWidening states", () => {
    expect(burstStepMultiplier(NO_EPISODE)).toBe(1);
    expect(burstSignBias(NO_EPISODE)).toBe(0);

    const spreadState: EpisodeState = {
      kind: "spreadWidening",
      ticksRemaining: 5,
      duration: 10,
      peakFactor: 3,
      signBias: 0,
    };
    expect(burstStepMultiplier(spreadState)).toBe(1);
    expect(burstSignBias(spreadState)).toBe(0);
  });

  it("report the episode's fixed peak factor and sign bias for volBurst", () => {
    const burstState: EpisodeState = {
      kind: "volBurst",
      ticksRemaining: 5,
      duration: 10,
      peakFactor: 7,
      signBias: -1,
    };
    expect(burstStepMultiplier(burstState)).toBe(7);
    expect(burstSignBias(burstState)).toBe(-1);
  });
});

// --- Detector integration -------------------------------------------------
//
// Proves DEFAULT_EPISODE_CONFIG's peak/duration bounds actually cross
// DEFAULT_ANOMALY_CONFIG's (unmodified) 3σ thresholds — the whole point of
// this module. Ticks are built directly from the pure episode functions,
// independent of PricingSimulator's timers/live-stream plumbing: this is a
// test of the episode SHAPE's effect on the detector, not of the
// probabilistic start trigger (covered above) or of the live scheduling
// (covered in PricingSimulator.test.ts).

const EURUSD_HALF_SPREAD = 0.00007; // typicalSpreadPips 1.4 / 2 * pipUnit(4)
const EURUSD_STEP_SIZE = 0.00018; // stepSizeFor(EURUSD): 1.8 * pipUnit(4)

function buildTickSequence(
  steadyTicks: number,
  forcedEpisode: EpisodeState,
  random: () => number,
): PriceTick[] {
  let mid = 1.1;
  let episode: EpisodeState = NO_EPISODE;
  const ticks: PriceTick[] = [];
  const totalTicks = steadyTicks + forcedEpisode.duration + 10;

  for (let t = 0; t < totalTicks; t++) {
    episode =
      t === steadyTicks
        ? forcedEpisode
        : advanceEpisode(episode, random, {
            ...DEFAULT_EPISODE_CONFIG,
            startProbability: 0, // never spontaneously start a second episode
          });

    const stepMultiplier = burstStepMultiplier(episode);
    const signBias = burstSignBias(episode);
    const raw = random() - 0.5;
    const r = signBias === 0 ? raw : signBias * Math.abs(raw);
    mid = mid + r * EURUSD_STEP_SIZE * stepMultiplier;

    const halfSpread = EURUSD_HALF_SPREAD * spreadFactor(episode);
    ticks.push({
      symbol: "EURUSD",
      mid,
      ask: mid + halfSpread,
      bid: mid - halfSpread,
      valueDate: "2026-08-05",
      creationTimestamp: t,
    });
  }

  return ticks;
}

describe("detector integration (proves the calibration actually fires)", () => {
  it("a forced spreadWidening episode trips detectAnomalies' spreadWidening channel at least once", async () => {
    const random = scriptedRandom(
      Array.from({ length: 2000 }, (_, i) => (i * 0.6180339887) % 1), // low-discrepancy-ish fill, deterministic
    ).random;

    const ticks = buildTickSequence(
      DEFAULT_ANOMALY_CONFIG.minWindowFill + 5,
      {
        kind: "spreadWidening",
        ticksRemaining: DEFAULT_EPISODE_CONFIG.maxDurationTicks,
        duration: DEFAULT_EPISODE_CONFIG.maxDurationTicks,
        peakFactor: DEFAULT_EPISODE_CONFIG.spreadPeakRange[1],
        signBias: 0,
      },
      random,
    );

    const events = await new Promise<
      readonly { kind: string; symbol: string; sigma: number }[]
    >((resolve, reject) => {
      detectAnomalies(from(ticks), DEFAULT_ANOMALY_CONFIG)
        .pipe(toArray())
        .subscribe({ next: resolve, error: reject });
    });

    const spreadEvents = events.filter((e) => e.kind === "spreadWidening");
    expect(spreadEvents.length).toBeGreaterThanOrEqual(1);
    for (const e of spreadEvents) {
      expect(e.symbol).toBe("EURUSD");
      expect(e.sigma).toBeGreaterThanOrEqual(
        DEFAULT_ANOMALY_CONFIG.spreadSigma,
      );
    }
  });

  it("a forced volBurst episode trips detectAnomalies' volSpike channel at least once", async () => {
    const random = scriptedRandom(
      Array.from({ length: 2000 }, (_, i) => (i * 0.6180339887) % 1),
    ).random;

    const ticks = buildTickSequence(
      DEFAULT_ANOMALY_CONFIG.minWindowFill + 5,
      {
        kind: "volBurst",
        ticksRemaining: DEFAULT_EPISODE_CONFIG.minDurationTicks,
        duration: DEFAULT_EPISODE_CONFIG.minDurationTicks,
        peakFactor: DEFAULT_EPISODE_CONFIG.burstPeakRange[1],
        signBias: 1,
      },
      random,
    );

    const events = await new Promise<
      readonly { kind: string; symbol: string; sigma: number }[]
    >((resolve, reject) => {
      detectAnomalies(from(ticks), DEFAULT_ANOMALY_CONFIG)
        .pipe(toArray())
        .subscribe({ next: resolve, error: reject });
    });

    const volEvents = events.filter((e) => e.kind === "volSpike");
    expect(volEvents.length).toBeGreaterThanOrEqual(1);
    for (const e of volEvents) {
      expect(e.symbol).toBe("EURUSD");
      expect(e.sigma).toBeGreaterThanOrEqual(DEFAULT_ANOMALY_CONFIG.volSigma);
    }
  });
});
