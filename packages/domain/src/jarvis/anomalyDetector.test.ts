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

/**
 * A window of `n` equal baseline values plus one outlier `b` has a
 * population-std z-score for the outlier that approaches sqrt(n-1) as
 * `b` dominates the baseline — never higher, regardless of how extreme `b`
 * is. Every fixture below picks window sizes and outlier ratios so that
 * bound comfortably clears the configured sigma (3 by default).
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

const BASELINE_MID = 1.1;
const BASELINE_BID = 1.0999;
const BASELINE_ASK = 1.1001; // spread = 0.0002
const SPIKE_BID = 1.075;
const SPIKE_ASK = 1.125; // spread = 0.05 — 250x the baseline spread

function baselineSpreadTick(symbol: string, i: number): PriceTick {
  return mkTick(symbol, BASELINE_BID, BASELINE_ASK, i, BASELINE_MID);
}

function spikeSpreadTick(symbol: string, i: number): PriceTick {
  return mkTick(symbol, SPIKE_BID, SPIKE_ASK, i, BASELINE_MID);
}

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
      baselineSpreadTick("EURUSD", 0),
      baselineSpreadTick("EURUSD", 1),
      baselineSpreadTick("EURUSD", 2),
      spikeSpreadTick("EURUSD", 3), // only the 4th tick — below minWindowFill=5
    ];

    const events = await collect(ticks, {
      windowSize: 10,
      minWindowFill: 5,
    });

    expect(events).toEqual([]);
  });
});

describe("detectAnomalies — spread edge-trigger", () => {
  // A window holding k baseline values and m same-magnitude outliers gives
  // each outlier a population-std z-score that converges to sqrt(k/m) once
  // the outlier dominates the baseline (verified against this fixture's
  // exact 250x ratio to within 1e-3). Three outliers accumulate by the
  // final crossing below, so k=35 keeps sqrt(35/3)=3.4 comfortably above
  // spreadSigma=3 even then.
  const cfg: Partial<AnomalyDetectorConfig> = {
    windowSize: 100,
    minWindowFill: 35,
  };

  it("crosses once, stays silent while above, and re-arms after dropping below", async () => {
    const ticks: PriceTick[] = [];
    let i = 0;
    // 35 baseline ticks reach minWindowFill; the window is still all-baseline
    // so std is 0 here (the σ=0 guard) — no emission yet.
    for (let n = 0; n < 35; n++) {
      ticks.push(baselineSpreadTick("EURUSD", i++));
    }
    ticks.push(spikeSpreadTick("EURUSD", i++)); // crosses -> emits once
    ticks.push(spikeSpreadTick("EURUSD", i++)); // stays above -> silent
    ticks.push(baselineSpreadTick("EURUSD", i++)); // drops below -> re-arms, silent
    ticks.push(spikeSpreadTick("EURUSD", i++)); // crosses again -> emits again

    const events = await collect(ticks, cfg);
    const spreadEvents = events.filter((e) => e.kind === "spreadWidening");

    expect(spreadEvents).toHaveLength(2);
    for (const e of spreadEvents) {
      expect(e.symbol).toBe("EURUSD");
      expect(e.sigma).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("detectAnomalies — constant series (σ=0 guard)", () => {
  it("never emits for a perfectly constant spread and mid", async () => {
    const ticks = Array.from({ length: 30 }, (_, n) =>
      baselineSpreadTick("EURUSD", n),
    );

    const events = await collect(ticks, { windowSize: 50, minWindowFill: 20 });

    expect(events).toEqual([]);
  });
});

describe("detectAnomalies — per-symbol isolation", () => {
  it("keeps EURUSD and GBPUSD windows, counters, and arming fully independent", async () => {
    const cfg: Partial<AnomalyDetectorConfig> = {
      windowSize: 50,
      minWindowFill: 20,
    };

    const eurTicks: PriceTick[] = [];
    for (let n = 0; n < 20; n++) {
      eurTicks.push(baselineSpreadTick("EURUSD", n));
    }
    eurTicks.push(spikeSpreadTick("EURUSD", 20)); // the one EURUSD crossing

    // GBPUSD never spikes and outnumbers EURUSD's tick count, so if the
    // detector shared state across symbols this would either mask the
    // EURUSD crossing or spuriously fire for GBPUSD.
    const gbpTicks: PriceTick[] = Array.from({ length: 25 }, (_, n) =>
      baselineSpreadTick("GBPUSD", n),
    );

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
    const gbpEvents = events.filter((e) => e.symbol === "GBPUSD");
    const eurEvents = events.filter((e) => e.symbol === "EURUSD");

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

  it("fires on a single-tick return that dwarfs the window's own rolling σ", async () => {
    const ticks: PriceTick[] = [];
    let i = 0;
    // Spread held perfectly constant throughout — isolates this test to the
    // vol channel; the σ=0 guard keeps spreadWidening silent for all of it.
    for (let n = 0; n < 20; n++) {
      ticks.push(mkTick("EURUSD", BASELINE_BID, BASELINE_ASK, i++, 1.1));
    }
    // A 50% mid jump — the window's baseline returns are all 0, so any
    // non-zero outlier's z-score approaches sqrt(returns.length - 1); with
    // ~19 baseline zero-returns that bound is well above volSigma=3.
    ticks.push(mkTick("EURUSD", BASELINE_BID, BASELINE_ASK, i++, 1.65));

    const events = await collect(ticks, cfg);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("volSpike");
    expect(events[0]?.symbol).toBe("EURUSD");
    expect(events[0]?.sigma).toBeGreaterThanOrEqual(3);
  });
});
