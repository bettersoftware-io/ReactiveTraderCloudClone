import {
  BehaviorSubject,
  Observable,
  of,
  Subject,
  shareReplay,
  throwError,
} from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it, vi } from "vitest";

import type {
  AnomalyDetectorConfig,
  CurrencyPair,
  JarvisNarratorPreference,
  PriceTick,
} from "@rtc/domain";

import {
  createNarratorMachine,
  MAX_NARRATIONS_PER_SESSION,
  NARRATION_COOLDOWN_MS,
  type NarratorDeps,
} from "../NarratorMachine";

describe("createNarratorMachine — exported constants", () => {
  it("pins NARRATION_COOLDOWN_MS and MAX_NARRATIONS_PER_SESSION", () => {
    expect(NARRATION_COOLDOWN_MS).toBe(300_000);
    expect(MAX_NARRATIONS_PER_SESSION).toBe(4);
  });
});

describe("createNarratorMachine — prompt format (pinned)", () => {
  it("narrates the first surviving spreadWidening anomaly with the exact pinned format", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const rig = buildRig(ts);
      const handle = createNarratorMachine(rig.deps);

      ts.schedule(() => {
        const next = fillSpreadBaseline(rig.registry, SYMBOL);
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, next));
      }, 0);

      flush();

      expect(rig.narrate).toHaveBeenCalledTimes(1);
      expect(rig.narrate).toHaveBeenCalledWith(
        "[narration] EURUSD spread widened 2490.0σ over the last window.",
      );
      handle.stop();
    });
  });

  it("narrates a volSpike anomaly with 'moved' — never 'volatility jumped' (T7 review ruling)", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const rig = buildRig(ts);
      const handle = createNarratorMachine(rig.deps);

      ts.schedule(() => {
        const next = fillVolBaseline(rig.registry, SYMBOL);
        rig.registry.push(SYMBOL, volSpikeTick(SYMBOL, next));
      }, 0);

      flush();

      expect(rig.narrate).toHaveBeenCalledTimes(1);
      expect(rig.narrate).toHaveBeenCalledWith(
        "[narration] EURUSD moved 2749.3σ over the last window.",
      );

      const [prompt] = rig.narrate.mock.calls[0] ?? [];
      expect(prompt).not.toContain("volatility jumped");
      handle.stop();
    });
  });
});

describe("createNarratorMachine — cooldown gate (virtual time)", () => {
  it("drops a second anomaly inside NARRATION_COOLDOWN_MS, then admits the next one once it has elapsed", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const rig = buildRig(ts);
      const handle = createNarratorMachine(rig.deps);
      let i = 0;

      // t=0: fill + first crossing → narrate call #1.
      ts.schedule(() => {
        i = fillSpreadBaseline(rig.registry, SYMBOL);
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, i++));
      }, 0);

      // t=1000 (well inside the 5-minute cooldown): re-arm + second
      // crossing → dropped, no new narrate call.
      ts.schedule(() => {
        rig.registry.push(SYMBOL, rearmSpreadTick(SYMBOL, i++));
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, i++));
      }, 1_000);

      // t=NARRATION_COOLDOWN_MS+1 (just past the cooldown): re-arm + third
      // crossing → admitted, narrate call #2.
      ts.schedule(() => {
        rig.registry.push(SYMBOL, rearmSpreadTick(SYMBOL, i++));
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, i++));
      }, NARRATION_COOLDOWN_MS + 1);

      flush();

      expect(rig.narrate).toHaveBeenCalledTimes(2);
      handle.stop();
    });
  });

  // Review fix (T9 round 1, Finding 2a): the gate is a SINGLE `scan` folding
  // over the whole anomaly stream regardless of which symbol produced each
  // event, so it must narrate AT MOST ONCE for a same-frame double-anomaly
  // even when the two anomalies come from two DIFFERENT symbols — not once
  // per symbol. A per-symbol-keyed rewrite (e.g. `groupBy(symbol)` +
  // per-group `throttleTime`) would regress this invisibly.
  it("narrates AT MOST ONCE for a same-frame double anomaly across two different symbols — the gate is GLOBAL, not per-symbol", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const symbolA = "EURUSD";
      const symbolB = "GBPUSD";
      const rig = buildRig(
        ts,
        of("on"),
        of([mkPair(symbolA), mkPair(symbolB)]),
      );
      const handle = createNarratorMachine(rig.deps);

      // Both symbols fill their baselines and cross in the SAME
      // synchronous scheduled callback (frame 0) — a genuine same-frame
      // double anomaly, not two anomalies merely close in virtual time.
      ts.schedule(() => {
        const nextA = fillSpreadBaseline(rig.registry, symbolA);
        const nextB = fillSpreadBaseline(rig.registry, symbolB);
        rig.registry.push(symbolA, spikeSpreadTick(symbolA, nextA));
        rig.registry.push(symbolB, spikeSpreadTick(symbolB, nextB));
      }, 0);

      flush();

      expect(rig.narrate).toHaveBeenCalledTimes(1);
      handle.stop();
    });
  });
});

describe("createNarratorMachine — session cap", () => {
  it("drops every narration once MAX_NARRATIONS_PER_SESSION has been dispatched, even well past the cooldown", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const rig = buildRig(ts);
      const handle = createNarratorMachine(rig.deps);
      let i = 0;
      const cycleGapMs = NARRATION_COOLDOWN_MS + 1;

      ts.schedule(() => {
        i = fillSpreadBaseline(rig.registry, SYMBOL);
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, i++));
      }, 0);

      // 4 more cycles, each safely past the prior cycle's cooldown — a
      // 6th cycle (5 total crossings) exercises the hard session cap.
      for (let cycle = 1; cycle <= 5; cycle++) {
        ts.schedule(() => {
          rig.registry.push(SYMBOL, rearmSpreadTick(SYMBOL, i++));
          rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, i++));
        }, cycle * cycleGapMs);
      }

      flush();

      // 6 crossings total (the t=0 one + 5 more); only the first
      // MAX_NARRATIONS_PER_SESSION (4) are ever dispatched.
      expect(rig.narrate).toHaveBeenCalledTimes(MAX_NARRATIONS_PER_SESSION);
      handle.stop();
    });
  });

  // Review fix (T9 round 1, Finding 2b): the gate `scan` sits OUTSIDE
  // `pairs$`'s `switchMap` (see createNarratorMachine's doc), so a `pairs$`
  // re-emission (e.g. a reconnect re-fetching reference data, which makes
  // `switchMap` tear down and rebuild the inner merged tick source) must
  // NOT reset the session-cap counter — a rewrite that scoped the gate
  // "per roster" (moved inside the switchMap) is the worst regression this
  // file could take, per the review.
  it("the session cap survives a pairs$ re-emission (switchMap resubscribing must not reset the gate)", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const pairs$ = new BehaviorSubject<readonly CurrencyPair[]>([
        mkPair(SYMBOL),
      ]);
      const rig = buildRig(ts, of("on"), pairs$);
      const handle = createNarratorMachine(rig.deps);
      let i = 0;
      const cycleGapMs = NARRATION_COOLDOWN_MS + 1;

      // t=0 + 3 more cycles = 4 narrations — MAX_NARRATIONS_PER_SESSION
      // reached.
      ts.schedule(() => {
        i = fillSpreadBaseline(rig.registry, SYMBOL);
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, i++));
      }, 0);

      for (let cycle = 1; cycle <= 3; cycle++) {
        ts.schedule(() => {
          rig.registry.push(SYMBOL, rearmSpreadTick(SYMBOL, i++));
          rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, i++));
        }, cycle * cycleGapMs);
      }

      // Re-emit pairs$ with the SAME roster mid-way through the 4th gap —
      // simulates a reconnect re-fetching reference data. The underlying
      // shared tick registry keeps routing pushes to the same symbol
      // correctly across switchMap's resubscription (see
      // makeSharedTickRegistry's doc). Re-fills the baseline right after
      // (harmless padding onto an already-full window under CORRECT code —
      // detectAnomalies' own per-symbol window sits outside the switchMap
      // exactly like the gate does — but load-bearing for this test to
      // isolate the GATE specifically: a buggy switchMap-scoped rewrite
      // would reset the detector's window too, and without a re-fill that
      // would starve the 5th cycle's crossing regardless of the gate,
      // masking the very regression this test exists to catch).
      ts.schedule(
        () => {
          pairs$.next([mkPair(SYMBOL)]);
          fillSpreadBaseline(rig.registry, SYMBOL);
        },
        3 * cycleGapMs + 10,
      );

      // A 5th cycle, safely past cycle 4's own cooldown window — if the
      // re-emission had reset the session-cap counter this WOULD narrate;
      // it must not.
      ts.schedule(() => {
        rig.registry.push(SYMBOL, rearmSpreadTick(SYMBOL, i++));
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, i++));
      }, 4 * cycleGapMs);

      flush();

      expect(rig.narrate).toHaveBeenCalledTimes(MAX_NARRATIONS_PER_SESSION);
      handle.stop();
    });
  });
});

describe("createNarratorMachine — preference gate", () => {
  it("drops a surviving anomaly while the preference is 'off' WITHOUT consuming a slot, then re-enables live on 'on' with no re-composition", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const preference$ = new BehaviorSubject<JarvisNarratorPreference>("off");
      const rig = buildRig(ts, preference$);
      const handle = createNarratorMachine(rig.deps);
      let i = 0;

      // t=0: fill + crossing while "off" → dropped, no narrate call, and
      // (per the "no slot consumed" claim) this must not count against
      // MAX_NARRATIONS_PER_SESSION or start the cooldown clock.
      ts.schedule(() => {
        i = fillSpreadBaseline(rig.registry, SYMBOL);
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, i++));
      }, 0);

      // t=1: flip the SAME live preference stream to "on" — no
      // re-composition, the machine has stayed subscribed throughout.
      ts.schedule(() => {
        preference$.next("on");
      }, 1);

      // t=2: re-arm + a fresh crossing → now admitted.
      ts.schedule(() => {
        rig.registry.push(SYMBOL, rearmSpreadTick(SYMBOL, i++));
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, i++));
      }, 2);

      flush();

      expect(rig.narrate).toHaveBeenCalledTimes(1);
      handle.stop();
    });
  });
});

describe("createNarratorMachine — error guard", () => {
  it("a tick-source error does not throw out of construction, never narrates, and leaves stop() safe to call", () => {
    const ts = scheduler();
    ts.run(() => {
      const narrate = vi.fn<(prompt: string) => void>();

      let handle: ReturnType<typeof createNarratorMachine> | undefined;

      expect(() => {
        handle = createNarratorMachine({
          pairs$: of([mkPair(SYMBOL)]),
          priceFor: () => {
            return throwError(() => {
              return new Error("boom");
            });
          },
          narrate,
          preference$: of("on"),
          scheduler: ts,
          config: CFG,
        });
      }).not.toThrow();

      expect(narrate).not.toHaveBeenCalled();
      expect(() => {
        handle?.stop();
      }).not.toThrow();
    });
  });
});

describe("createNarratorMachine — pair roster arrives asynchronously", () => {
  it("waits for pairs$'s first emission before detecting anything, then narrates once pairs are known", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const pairs$ = new Subject<readonly CurrencyPair[]>();
      const rig = buildRig(ts, of("on"), pairs$);
      const handle = createNarratorMachine(rig.deps);

      // t=0: a tick pushed before pairs$ has ever emitted goes nowhere —
      // the narrator hasn't subscribed to this symbol's tick stream yet
      // (switchMap only subscribes once pairs$ emits).
      ts.schedule(() => {
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, 0));
      }, 0);

      // t=1: the watchlist/reference-data roster resolves.
      ts.schedule(() => {
        pairs$.next([mkPair(SYMBOL)]);
      }, 1);

      // t=2: now the fill + crossing is actually observed.
      ts.schedule(() => {
        const next = fillSpreadBaseline(rig.registry, SYMBOL);
        rig.registry.push(SYMBOL, spikeSpreadTick(SYMBOL, next));
      }, 2);

      flush();

      expect(rig.narrate).toHaveBeenCalledTimes(1);
      handle.stop();
    });
  });
});

// Review fix (T9 round 1, Finding 1): NarratorMachine must consume ticks
// through the SAME shared, per-symbol-cached `priceFor` every other
// price-driven consumer reads through (composition injects
// `PriceStreamPresenter.price$` — see `NarratorDeps.priceFor`'s doc) rather
// than a fresh direct port call, because the underlying live tick source is
// COLD per subscription and mutates SHARED per-pair state on its own timer
// loop (the #171 tick-acceleration family). This suite proves the shape at
// the unit level: a subscription-counting fake registry asserts exactly ONE
// underlying subscription per symbol even when BOTH the narrator AND a
// simulated second consumer (a price tile) attach to the same cached
// `priceFor`.
describe("createNarratorMachine — shared tick source (no double subscription)", () => {
  it("the narrator and a simulated second consumer share ONE underlying subscription per symbol", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const registry = makeSharedTickRegistry();
      const pair = mkPair(SYMBOL);
      const narrate = vi.fn<(prompt: string) => void>();
      const deps: NarratorDeps = {
        pairs$: of([pair]),
        priceFor: registry.priceFor,
        narrate,
        preference$: of("on"),
        scheduler: ts,
        config: CFG,
      };

      const handle = createNarratorMachine(deps);

      // A second, independent consumer of the SAME cached priceFor — e.g. a
      // price tile mounting for the same symbol. Kept subscribed (not
      // torn down) so both consumers are simultaneously live, matching the
      // review's "narrator + a simulated tile consumer both attach".
      const tileSub = registry.priceFor(pair).subscribe();

      ts.schedule(() => {
        const next = fillSpreadBaseline(registry, SYMBOL);
        registry.push(SYMBOL, spikeSpreadTick(SYMBOL, next));
      }, 0);

      flush();

      expect(registry.subscribeCount(SYMBOL)).toBe(1);
      expect(narrate).toHaveBeenCalledTimes(1);

      tileSub.unsubscribe();
      handle.stop();
    });
  });
});

// --- Fixtures -------------------------------------------------------------
//
// Both channels' baseline/spike shapes are ported verbatim from
// `@rtc/domain`'s `anomalyDetector.test.ts` (jitteredBaselineSpreadTick /
// spikeSpreadTick / volBaselineTick / volSpikeTick) — see that file's own
// doc for why alternating LOW/HIGH values give an EXACT, hand-computable
// population σ (mean = (LOW+HIGH)/2, σ = (HIGH-LOW)/2 for any 50/50 split).
// The two "pinned prompt format" tests above use a fixed 250-baseline-tick
// window so the resulting σ (and therefore the exact rendered prompt
// string) is fully deterministic — verified against a standalone port of
// the same population mean/σ math before being hardcoded here.

const SYMBOL = "EURUSD";
const FIXED_MID = 1.1;

const JITTER_LOW_BID = 1.09991;
const JITTER_LOW_ASK = 1.10009;
const JITTER_HIGH_BID = 1.09989;
const JITTER_HIGH_ASK = 1.10011;
const SPIKE_BID = 1.075;
const SPIKE_ASK = 1.125;

const VOL_HALF_SPREAD = 0.0001;
const VOL_MID_LOW = 1.0999;
const VOL_MID_HIGH = 1.1001;
const VOL_SPIKE_MID = 1.65;

const BASELINE_FILL = 250;
const CFG: Partial<AnomalyDetectorConfig> = {
  windowSize: 300,
  minWindowFill: BASELINE_FILL,
};

/** A minimal, valid `CurrencyPair` for `symbol` — only `.symbol` is read by
 * anything under test (`priceFor`/`detectAnomalies` key purely off tick
 * symbols), the rest is filler satisfying the type. */
function mkPair(symbol: string): CurrencyPair {
  return {
    symbol,
    ratePrecision: 5,
    pipsPosition: 4,
    base: symbol.slice(0, 3),
    terms: symbol.slice(3, 6),
    defaultNotional: 1_000_000,
    baseMid: 1.1,
    typicalSpreadPips: 1.4,
  };
}

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

/** One jittered baseline spread tick, constant mid (isolates the fixture to
 * the spread channel — returns are all exactly 0, so the vol channel's
 * σ=0 guard keeps it silent). */
function jitteredSpreadTick(
  symbol: string,
  parity: number,
  i: number,
): PriceTick {
  return parity % 2 === 0
    ? mkTick(symbol, JITTER_LOW_BID, JITTER_LOW_ASK, i, FIXED_MID)
    : mkTick(symbol, JITTER_HIGH_BID, JITTER_HIGH_ASK, i, FIXED_MID);
}

function spikeSpreadTick(symbol: string, i: number): PriceTick {
  return mkTick(symbol, SPIKE_BID, SPIKE_ASK, i, FIXED_MID);
}

/** One "re-arm the spread channel" tick — a jittered baseline value dropping
 * the trailing window back below `spreadSigma`, matching the domain
 * detector's own "crosses once ... re-arms after dropping below" fixture. */
function rearmSpreadTick(symbol: string, i: number): PriceTick {
  return jitteredSpreadTick(symbol, i, i);
}

/** Pushes `BASELINE_FILL` jittered spread ticks (indices `0..249`) for
 * `symbol` into `registry`, returning the next free tick index (`250`) for
 * the caller's own follow-on ticks (a spike, a rearm tick, ...). */
function fillSpreadBaseline(
  registry: SharedTickRegistry,
  symbol: string,
): number {
  for (let n = 0; n < BASELINE_FILL; n++) {
    registry.push(symbol, jitteredSpreadTick(symbol, n, n));
  }

  return BASELINE_FILL;
}

/** One alternating-mid baseline tick, constant spread (isolates the fixture
 * to the vol channel — spread is bit-identical every tick, so the spread
 * channel's σ=0 guard keeps it silent). */
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

function fillVolBaseline(registry: SharedTickRegistry, symbol: string): number {
  for (let n = 0; n < BASELINE_FILL; n++) {
    registry.push(symbol, volBaselineTick(symbol, n, n));
  }

  return BASELINE_FILL;
}

function scheduler(): TestScheduler {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

/** A fake `priceFor` layer modeling `PriceStreamPresenter.price$`'s real
 * shape: a per-symbol CACHED, `shareReplay({refCount: true})`-multicast
 * stream over a genuinely COLD underlying source — mirrors
 * `PricingSimulator.getPriceUpdates`'s own "fresh timer loop per
 * subscription" contract (see `NarratorDeps.priceFor`'s doc). `push` writes
 * directly to the per-symbol `Subject` the cold source wraps, independent
 * of how many (or how few) multicast subscribers are currently attached —
 * so pushes always land correctly across a `switchMap` resubscription.
 * `subscribeCount(symbol)` reports how many times the COLD source itself
 * was subscribed — the number a correctly-shared cache keeps at 1 no
 * matter how many logical consumers call `priceFor` for the same symbol. */
interface SharedTickRegistry {
  readonly priceFor: (pair: CurrencyPair) => Observable<PriceTick>;
  readonly push: (symbol: string, tick: PriceTick) => void;
  readonly subscribeCount: (symbol: string) => number;
}

function makeSharedTickRegistry(): SharedTickRegistry {
  const subjects = new Map<string, Subject<PriceTick>>();
  const shared = new Map<string, Observable<PriceTick>>();
  const counts = new Map<string, number>();

  function subjectFor(symbol: string): Subject<PriceTick> {
    const existing = subjects.get(symbol);

    if (existing) {
      return existing;
    }

    const created = new Subject<PriceTick>();
    subjects.set(symbol, created);
    return created;
  }

  return {
    priceFor: (pair: CurrencyPair): Observable<PriceTick> => {
      const cached = shared.get(pair.symbol);

      if (cached) {
        return cached;
      }

      const cold = new Observable<PriceTick>((subscriber) => {
        counts.set(pair.symbol, (counts.get(pair.symbol) ?? 0) + 1);
        return subjectFor(pair.symbol).subscribe(subscriber);
      });

      const stream = cold.pipe(shareReplay({ bufferSize: 1, refCount: true }));
      shared.set(pair.symbol, stream);
      return stream;
    },
    push: (symbol: string, tick: PriceTick): void => {
      subjectFor(symbol).next(tick);
    },
    subscribeCount: (symbol: string): number => {
      return counts.get(symbol) ?? 0;
    },
  };
}

interface Rig {
  readonly registry: SharedTickRegistry;
  readonly preference$: Observable<JarvisNarratorPreference>;
  readonly narrate: ReturnType<typeof vi.fn<(prompt: string) => void>>;
  readonly ts: TestScheduler;
  readonly deps: NarratorDeps;
}

function buildRig(
  ts: TestScheduler,
  preference$: Observable<JarvisNarratorPreference> = of("on"),
  pairs$: Observable<readonly CurrencyPair[]> = of([mkPair(SYMBOL)]),
): Rig {
  const registry = makeSharedTickRegistry();
  const narrate = vi.fn<(prompt: string) => void>();
  const deps: NarratorDeps = {
    pairs$,
    priceFor: registry.priceFor,
    narrate,
    preference$,
    scheduler: ts,
    config: CFG,
  };

  return { registry, preference$, narrate, ts, deps };
}
