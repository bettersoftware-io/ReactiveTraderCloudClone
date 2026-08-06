import { lastValueFrom, of } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import type { PriceTick } from "../fx/price.js";
import {
  type AnomalyDetectorConfig,
  type AnomalyEvent,
  DEFAULT_ANOMALY_CONFIG,
  detectAnomalies,
} from "./anomalyDetector.js";

const FIXED_MID = 1.1;

// --- Exactly-constant fixtures — for tests where the window itself must
// have literal σ=0 (cold start; the plain σ=0 guard). ---
const FLAT_BID = 1.0999;
const FLAT_ASK = 1.1001; // spread = 0.0002, bit-identical every tick

const SPIKE_BID = 1.075;
const SPIKE_ASK = 1.125; // spread = 0.05 — 250x the ~0.0002 baseline mean

// --- Jittered fixtures — a window needs SOME real (non-float-noise,
// non-zero) variance for a spike's z-score against it to be well-defined
// once the spike is excluded from its own baseline (FIX 2). Alternating
// between two close values gives an exact, hand-computable population σ:
// mean = (LOW+HIGH)/2 = 0.0002, σ = (HIGH-LOW)/2 = 0.00002, for any 50/50
// split. ---
const JITTER_LOW_BID = 1.09991;
const JITTER_LOW_ASK = 1.10009; // spread = 0.00018
const JITTER_HIGH_BID = 1.09989;
const JITTER_HIGH_ASK = 1.10011; // spread = 0.00022

// Spread channel: 29 bit-identical spreads + one tick nudged by exactly one
// ULP on `ask`. Population σ of that 30-value window ≈ 3.99e-17 (measured) —
// nonzero, so a bare `std === 0` guard does NOT catch it, unlike the
// literally-repeated FLAT_SPREAD windows above (whose σ reduces to exactly
// 0.0 in this file's meanAndStd, verified separately). A FRESH tick that
// recurs the identical one-ULP-off value (the 31st, not a self-comparison)
// evaluated against that window scores z ≈ 5.385 under "no guard at all" —
// comfortably over the default spreadSigma=3 — hand-computed and
// cross-checked against a standalone port of `meanAndStd`/the exclude-
// current evaluation order (see the fix report for the script + output).
const ONE_ULP_OFF_ASK: number = ulpJitter(FLAT_ASK, 1);

// Vol channel: an otherwise perfectly flat mid (returns exactly 0 every
// tick, so the trailing window's mean is genuinely ~0 by construction — the
// exact condition that made the round-1 mean-relative guard inert) with a
// single momentary few-ULP nudge, then straight back to flat. Spread is
// held fixed throughout so this fixture only exercises the vol channel.
const WOBBLE_MID = 1.1;
const WOBBLE_HALF_SPREAD = 0.0001;

// --- Vol fixtures — alternating mid gives a well-defined nonzero baseline
// σ of returns (mirrors the spread jitter above), with a fixed spread so
// this channel's own noise never leaks into spreadWidening. ---
const VOL_HALF_SPREAD = 0.0001;
const VOL_MID_LOW = 1.0999;
const VOL_MID_HIGH = 1.1001;

const VOL_SPIKE_MID = 1.65; // ~50% jump off the ~1.1 baseline

describe("DEFAULT_ANOMALY_CONFIG", () => {
  it("pins the documented defaults", () => {
    expect(DEFAULT_ANOMALY_CONFIG).toEqual({
      windowSize: 120,
      spreadSigma: 3,
      volSigma: 3,
      minWindowFill: 60,
    });
  });
});

describe("detectAnomalies — cold start", () => {
  it("emits nothing before minWindowFill ticks, even given an extreme spread", async () => {
    const ticks = [
      flatBaselineSpreadTick("EURUSD", 0),
      flatBaselineSpreadTick("EURUSD", 1),
      flatBaselineSpreadTick("EURUSD", 2),
      spikeSpreadTick("EURUSD", 3), // only the 4th tick — below minWindowFill=5
    ];

    const events = await collect(ticks, {
      windowSize: 10,
      minWindowFill: 5,
    });

    expect(events).toEqual([]);
  });
});

describe("detectAnomalies — constant series (σ=0 guard)", () => {
  it("never emits for a perfectly constant spread and mid", async () => {
    const ticks = Array.from({ length: 30 }, (_, n) => {
      return flatBaselineSpreadTick("EURUSD", n);
    });

    const events = await collect(ticks, { windowSize: 50, minWindowFill: 20 });

    expect(events).toEqual([]);
  });
});

describe("detectAnomalies — spread-channel ULP-noise guard (FIX 1 witness)", () => {
  it("stays silent when a single tick's spread differs from an otherwise bit-identical trailing window by exactly one ULP", async () => {
    // Trailing window at evaluation time: ticks 1-29 (bit-identical FLAT
    // spread) + tick 30 (nudged by exactly one ULP) = 30 entries, σ ≈
    // 3.99e-17. Tick 31 recurs that same one-ULP-off spread value and gets
    // evaluated against it. See the fixture comment above for the z ≈ 5.385
    // this scores with no guard at all.
    const ticks: PriceTick[] = [];
    let i = 0;

    for (let n = 0; n < 29; n++) {
      ticks.push(flatBaselineSpreadTick("EURUSD", i++));
    }

    ticks.push(oneUlpOffSpreadTick("EURUSD", i++)); // tick 30: the odd one out
    ticks.push(oneUlpOffSpreadTick("EURUSD", i++)); // tick 31: evaluated against it

    const events = await collect(ticks, { windowSize: 40, minWindowFill: 31 });
    const spreadEvents = events.filter((e) => {
      return e.kind === "spreadWidening";
    });

    expect(spreadEvents).toEqual([]);
  });
});

describe("detectAnomalies — vol-channel ULP-noise guard (FIX 1 witness)", () => {
  it("stays silent across a flat mid with a single momentary few-ULP wobble", async () => {
    // 45 flat ticks, one tick nudged 3 ULPs off the flat mid, then 14 more
    // flat ticks. Every trailing window here has a returns-channel mean
    // indistinguishable from 0 (this is exactly the shape that made the
    // round-1 mean-relative guard inert on this channel). Independently
    // verified (see the fix report): with no guard at all, this exact
    // sequence produces one volSpike at sigma ≈ 6.78 — comfortably over the
    // default volSigma=3.
    const ticks: PriceTick[] = [];
    let i = 0;

    for (let n = 0; n < 45; n++) {
      ticks.push(flatVolTick("EURUSD", i++));
    }

    ticks.push(ulpWobbleMidTick("EURUSD", 3, i++));

    for (let n = 0; n < 14; n++) {
      ticks.push(flatVolTick("EURUSD", i++));
    }

    const events = await collect(ticks, { windowSize: 60, minWindowFill: 20 });
    const volEvents = events.filter((e) => {
      return e.kind === "volSpike";
    });

    expect(volEvents).toEqual([]);
  });
});

describe("detectAnomalies — spread edge-trigger (honest, unbounded σ)", () => {
  // See the file-level comment above `mkTick` for the k/m_prior bound this
  // fixture is built against. 36 baseline ticks keeps the SECOND crossing
  // (evaluated with 2 prior outliers already in the window) at
  // sqrt(37/2)≈4.3 — comfortably above spreadSigma=3.
  const cfg: Partial<AnomalyDetectorConfig> = {
    windowSize: 100,
    minWindowFill: 36,
  };

  it("crosses once with an unbounded σ, stays silent while above, and re-arms after dropping below", async () => {
    const ticks: PriceTick[] = [];
    let i = 0;
    let parity = 0;

    // 36 jittered baseline ticks reach minWindowFill; the window is still
    // all-baseline (σ≈0.00002, real, not float noise). The 36th tick's own
    // z against its 35-tick trailing window is ≈1.03 (measured — not "near
    // 0": the alternating LOW/HIGH parity means whichever value lands last
    // sits on one side of the trailing mean by roughly one baseline σ), well
    // under spreadSigma=3 either way — no emission yet.
    for (let n = 0; n < 36; n++) {
      ticks.push(jitteredBaselineSpreadTick("EURUSD", parity++, i++));
    }

    ticks.push(spikeSpreadTick("EURUSD", i++)); // m_prior=0 → crosses, unbounded σ
    ticks.push(spikeSpreadTick("EURUSD", i++)); // stays above → silent
    ticks.push(jitteredBaselineSpreadTick("EURUSD", parity++, i++)); // drops below → re-arms
    ticks.push(spikeSpreadTick("EURUSD", i++)); // m_prior=2 → crosses again, sqrt(37/2)≈4.3

    const events = await collect(ticks, cfg);
    const spreadEvents = events.filter((e) => {
      return e.kind === "spreadWidening";
    });

    expect(spreadEvents).toHaveLength(2);

    for (const e of spreadEvents) {
      expect(e.symbol).toBe("EURUSD");
      expect(e.sigma).toBeGreaterThanOrEqual(3);
    }

    // The first crossing has no prior outliers in its trailing window
    // (m_prior=0): its σ is bounded only by the real ~250x spike/baseline
    // ratio, not by windowSize — this is FIX 2's "unbounded, honest σ"
    // property. (Under the old self-inclusive math this could never have
    // exceeded sqrt(windowSize-1)≈9.9 regardless of the spike's real size.)
    expect(spreadEvents[0]?.sigma).toBeGreaterThan(500);
  });
});

describe("detectAnomalies — per-symbol isolation", () => {
  it("keeps EURUSD and GBPUSD windows, counters, and arming fully independent", async () => {
    const cfg: Partial<AnomalyDetectorConfig> = {
      windowSize: 50,
      minWindowFill: 20,
    };

    const eurTicks: PriceTick[] = [];
    let eurParity = 0;

    for (let n = 0; n < 20; n++) {
      eurTicks.push(jitteredBaselineSpreadTick("EURUSD", eurParity++, n));
    }

    eurTicks.push(spikeSpreadTick("EURUSD", 20)); // the one EURUSD crossing

    // GBPUSD never spikes and outnumbers EURUSD's tick count, so if the
    // detector shared state across symbols this would either mask the
    // EURUSD crossing or spuriously fire for GBPUSD.
    let gbpParity = 0;
    const gbpTicks: PriceTick[] = Array.from({ length: 25 }, (_, n) => {
      return jitteredBaselineSpreadTick("GBPUSD", gbpParity++, n);
    });

    const combined: PriceTick[] = [];

    for (let n = 0; n < Math.max(eurTicks.length, gbpTicks.length); n++) {
      if (n < gbpTicks.length) {
        combined.push(gbpTicks[n]);
      }

      if (n < eurTicks.length) {
        combined.push(eurTicks[n]);
      }
    }

    const events = await collect(combined, cfg);
    const gbpEvents = events.filter((e) => {
      return e.symbol === "GBPUSD";
    });

    const eurEvents = events.filter((e) => {
      return e.symbol === "EURUSD";
    });

    expect(gbpEvents).toEqual([]);
    expect(eurEvents).toHaveLength(1);
    expect(eurEvents[0]?.kind).toBe("spreadWidening");
  });
});

describe("detectAnomalies — vol spike", () => {
  const cfg: Partial<AnomalyDetectorConfig> = {
    windowSize: 50,
    minWindowFill: 20,
  };

  it("fires on a single-tick return that dwarfs the window's own trailing σ", async () => {
    const ticks: PriceTick[] = [];
    let i = 0;
    let parity = 0;

    // Spread held perfectly constant throughout — isolates this test to the
    // vol channel; the σ=0 guard keeps spreadWidening silent for all of it.
    for (let n = 0; n < 20; n++) {
      ticks.push(volBaselineTick("EURUSD", parity++, i++));
    }

    // A ~50% mid jump against a baseline return σ of ~1.8e-4 (from the
    // alternating mid) — its z-score dwarfs volSigma=3 by orders of
    // magnitude.
    ticks.push(volSpikeTick("EURUSD", i++));

    const events = await collect(ticks, cfg);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("volSpike");
    expect(events[0]?.symbol).toBe("EURUSD");
    expect(events[0]?.sigma).toBeGreaterThanOrEqual(3);
  });
});

describe("detectAnomalies — self-silencing / adaptivity", () => {
  it("a sustained wide-spread regime produces exactly one emission, not one per tick", async () => {
    const cfg: Partial<AnomalyDetectorConfig> = {
      windowSize: 40,
      minWindowFill: 36,
    };

    const ticks: PriceTick[] = [];
    let i = 0;
    let parity = 0;

    for (let n = 0; n < 36; n++) {
      ticks.push(jitteredBaselineSpreadTick("EURUSD", parity++, i++));
    }

    // Sustain the SAME wide-spread level for far longer than windowSize=40,
    // so the trailing window fully rolls over from baseline to regime-only
    // values. If the detector merely latched a boolean forever, this would
    // already prove "exactly one"; running it past a full window rollover
    // additionally proves the window itself re-centres on the regime (its
    // own σ against itself stops clearing spreadSigma, or the σ=0 guard
    // takes over once the window is pure-regime) — the detector goes quiet
    // for the ongoing regime rather than treating it as forever-anomalous.
    for (let n = 0; n < 80; n++) {
      ticks.push(spikeSpreadTick("EURUSD", i++));
    }

    const events = await collect(ticks, cfg);
    const spreadEvents = events.filter((e) => {
      return e.kind === "spreadWidening";
    });

    expect(spreadEvents).toHaveLength(1);
  });
});

/**
 * Every fixture below evaluates a value against the window EXCLUDING itself
 * (the detector evaluates before pushing — see `detectAnomalies`'s
 * docstring on the "honest, unbounded σ" property), so a single-tick
 * outlier's population-std z-score is UNBOUNDED as the outlier's magnitude
 * grows: there is no asymptotic cap the way there was under the old
 * self-inclusive math (which topped out at `sqrt(windowSize - 1)`
 * regardless of how extreme the outlier was).
 *
 * Once more than one same-magnitude outlier has already accumulated in the
 * trailing window, though, a *new* outlier's z-score against that window
 * DOES converge to a fixed ratio as its own magnitude keeps growing: with k
 * baseline values and `m_prior` same-magnitude outliers already sitting in
 * the window (not counting the one currently being evaluated),
 * `z → sqrt(k / m_prior)` as the outlier's magnitude dominates the
 * baseline. `m_prior = 0` (the very first outlier ever seen) falls out of
 * this formula as literally unbounded, matching the paragraph above;
 * `m_prior = 1` is the simplest finite case, `sqrt(k)` (this is the old
 * `sqrt(n-1)` bound's direct successor under the new exclude-current math).
 * Every window size below is picked so this bound comfortably clears the
 * configured sigma (3 by default) even after several outliers have
 * accumulated.
 */
function mkTick(
  symbol: string,
  bid: number,
  ask: number,
  i: number,
  mid: number = (bid + ask) / 2,
): PriceTick {
  return {
    symbol,
    bid,
    ask,
    mid,
    valueDate: "2026-01-01",
    creationTimestamp: i,
  };
}

async function collect(
  ticks: readonly PriceTick[],
  config: Partial<AnomalyDetectorConfig>,
): Promise<AnomalyEvent[]> {
  return lastValueFrom(detectAnomalies(of(...ticks), config).pipe(toArray()));
}

function flatBaselineSpreadTick(symbol: string, i: number): PriceTick {
  return mkTick(symbol, FLAT_BID, FLAT_ASK, i, FIXED_MID);
}

function spikeSpreadTick(symbol: string, i: number): PriceTick {
  return mkTick(symbol, SPIKE_BID, SPIKE_ASK, i, FIXED_MID);
}

function jitteredBaselineSpreadTick(
  symbol: string,
  parity: number,
  i: number,
): PriceTick {
  return parity % 2 === 0
    ? mkTick(symbol, JITTER_LOW_BID, JITTER_LOW_ASK, i, FIXED_MID)
    : mkTick(symbol, JITTER_HIGH_BID, JITTER_HIGH_ASK, i, FIXED_MID);
}

// --- ULP-noise fixtures (FIX 1 witnesses) — round 1's regression test built
// a 30-tick RAMP of independently-jittered bid/ask (a distinct multiplier
// per tick), but that ramp's own population σ (2.7e-15..4.1e-15) already
// sits ABOVE the round-1 guard's threshold, so the guard never actually
// fired and the test passed even with the guard reverted — proven in the
// round-2 fix report. The two fixtures below are real witnesses instead:
// a hand-computable exact shape (spread channel) and a fixture whose
// no-guard behaviour was independently verified to fire (vol channel), each
// checked to actually go RED when the new guard is reverted.
function ulpJitter(base: number, n: number): number {
  return base + n * Number.EPSILON * Math.abs(base);
}

function oneUlpOffSpreadTick(symbol: string, i: number): PriceTick {
  return mkTick(symbol, FLAT_BID, ONE_ULP_OFF_ASK, i, FIXED_MID);
}

function flatVolTick(symbol: string, i: number): PriceTick {
  return mkTick(
    symbol,
    WOBBLE_MID - WOBBLE_HALF_SPREAD,
    WOBBLE_MID + WOBBLE_HALF_SPREAD,
    i,
    WOBBLE_MID,
  );
}

function ulpWobbleMidTick(symbol: string, ulps: number, i: number): PriceTick {
  const mid = ulpJitter(WOBBLE_MID, ulps);
  return mkTick(
    symbol,
    mid - WOBBLE_HALF_SPREAD,
    mid + WOBBLE_HALF_SPREAD,
    i,
    mid,
  );
}

function volBaselineTick(symbol: string, parity: number, i: number): PriceTick {
  const mid = parity % 2 === 0 ? VOL_MID_LOW : VOL_MID_HIGH;
  return mkTick(symbol, mid - VOL_HALF_SPREAD, mid + VOL_HALF_SPREAD, i, mid);
}

function volSpikeTick(symbol: string, i: number): PriceTick {
  return mkTick(
    symbol,
    VOL_SPIKE_MID - VOL_HALF_SPREAD,
    VOL_SPIKE_MID + VOL_HALF_SPREAD,
    i,
    VOL_SPIKE_MID,
  );
}
