import {
  BehaviorSubject,
  type Observable,
  of,
  Subject,
  throwError,
} from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it, vi } from "vitest";

import type {
  AnomalyDetectorConfig,
  JarvisNarratorPreference,
  PriceTick,
  PricingPort,
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
        const next = fillSpreadBaseline(rig.tickSubject);
        rig.tickSubject.next(spikeSpreadTick(next));
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
        const next = fillVolBaseline(rig.tickSubject);
        rig.tickSubject.next(volSpikeTick(next));
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
        i = fillSpreadBaseline(rig.tickSubject);
        rig.tickSubject.next(spikeSpreadTick(i++));
      }, 0);

      // t=1000 (well inside the 5-minute cooldown): re-arm + second
      // crossing → dropped, no new narrate call.
      ts.schedule(() => {
        rig.tickSubject.next(rearmSpreadTick(i++));
        rig.tickSubject.next(spikeSpreadTick(i++));
      }, 1_000);

      // t=NARRATION_COOLDOWN_MS+1 (just past the cooldown): re-arm + third
      // crossing → admitted, narrate call #2.
      ts.schedule(() => {
        rig.tickSubject.next(rearmSpreadTick(i++));
        rig.tickSubject.next(spikeSpreadTick(i++));
      }, NARRATION_COOLDOWN_MS + 1);

      flush();

      expect(rig.narrate).toHaveBeenCalledTimes(2);
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
        i = fillSpreadBaseline(rig.tickSubject);
        rig.tickSubject.next(spikeSpreadTick(i++));
      }, 0);

      // 4 more cycles, each safely past the prior cycle's cooldown — a
      // 6th cycle (5 total crossings) exercises the hard session cap.
      for (let cycle = 1; cycle <= 5; cycle++) {
        ts.schedule(() => {
          rig.tickSubject.next(rearmSpreadTick(i++));
          rig.tickSubject.next(spikeSpreadTick(i++));
        }, cycle * cycleGapMs);
      }

      flush();

      // 6 crossings total (the t=0 one + 5 more); only the first
      // MAX_NARRATIONS_PER_SESSION (4) are ever dispatched.
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
        i = fillSpreadBaseline(rig.tickSubject);
        rig.tickSubject.next(spikeSpreadTick(i++));
      }, 0);

      // t=1: flip the SAME live preference stream to "on" — no
      // re-composition, the machine has stayed subscribed throughout.
      ts.schedule(() => {
        preference$.next("on");
      }, 1);

      // t=2: re-arm + a fresh crossing → now admitted.
      ts.schedule(() => {
        rig.tickSubject.next(rearmSpreadTick(i++));
        rig.tickSubject.next(spikeSpreadTick(i++));
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
      const explodingPricing: PricingPort = {
        getPriceUpdates: () => {
          return throwError(() => {
            return new Error("boom");
          });
        },
        getPriceHistory: () => {
          return of([]);
        },
        getRfqQuote: () => {
          return of();
        },
      };

      let handle: ReturnType<typeof createNarratorMachine> | undefined;

      expect(() => {
        handle = createNarratorMachine({
          pricing: explodingPricing,
          symbols$: of([SYMBOL]),
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

describe("createNarratorMachine — symbol roster arrives asynchronously", () => {
  it("waits for symbols$'s first emission before detecting anything, then narrates once symbols are known", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const symbols$ = new Subject<readonly string[]>();
      const rig = buildRig(ts, of("on"), symbols$);
      const handle = createNarratorMachine(rig.deps);

      // t=0: a tick pushed before symbols$ has ever emitted goes nowhere —
      // the narrator hasn't subscribed to this symbol's pricing stream yet
      // (switchMap only subscribes once symbols$ emits).
      ts.schedule(() => {
        rig.tickSubject.next(spikeSpreadTick(0));
      }, 0);

      // t=1: the watchlist/reference-data roster resolves.
      ts.schedule(() => {
        symbols$.next([SYMBOL]);
      }, 1);

      // t=2: now the fill + crossing is actually observed.
      ts.schedule(() => {
        const next = fillSpreadBaseline(rig.tickSubject);
        rig.tickSubject.next(spikeSpreadTick(next));
      }, 2);

      flush();

      expect(rig.narrate).toHaveBeenCalledTimes(1);
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

function mkTick(
  bid: number,
  ask: number,
  i: number,
  mid: number = (bid + ask) / 2,
): PriceTick {
  return {
    symbol: SYMBOL,
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
function jitteredSpreadTick(parity: number, i: number): PriceTick {
  return parity % 2 === 0
    ? mkTick(JITTER_LOW_BID, JITTER_LOW_ASK, i, FIXED_MID)
    : mkTick(JITTER_HIGH_BID, JITTER_HIGH_ASK, i, FIXED_MID);
}

function spikeSpreadTick(i: number): PriceTick {
  return mkTick(SPIKE_BID, SPIKE_ASK, i, FIXED_MID);
}

/** One "re-arm the spread channel" tick — a jittered baseline value dropping
 * the trailing window back below `spreadSigma`, matching the domain
 * detector's own "crosses once ... re-arms after dropping below" fixture. */
function rearmSpreadTick(i: number): PriceTick {
  return jitteredSpreadTick(i, i);
}

/** Pushes `BASELINE_FILL` jittered spread ticks (indices `0..249`) onto
 * `subject`, returning the next free tick index (`250`) for the caller's
 * own follow-on ticks (a spike, a rearm tick, ...). */
function fillSpreadBaseline(subject: Subject<PriceTick>): number {
  for (let n = 0; n < BASELINE_FILL; n++) {
    subject.next(jitteredSpreadTick(n, n));
  }

  return BASELINE_FILL;
}

/** One alternating-mid baseline tick, constant spread (isolates the fixture
 * to the vol channel — spread is bit-identical every tick, so the spread
 * channel's σ=0 guard keeps it silent). */
function volBaselineTick(parity: number, i: number): PriceTick {
  const mid = parity % 2 === 0 ? VOL_MID_LOW : VOL_MID_HIGH;
  return mkTick(mid - VOL_HALF_SPREAD, mid + VOL_HALF_SPREAD, i, mid);
}

function volSpikeTick(i: number): PriceTick {
  return mkTick(
    VOL_SPIKE_MID - VOL_HALF_SPREAD,
    VOL_SPIKE_MID + VOL_HALF_SPREAD,
    i,
    VOL_SPIKE_MID,
  );
}

function fillVolBaseline(subject: Subject<PriceTick>): number {
  for (let n = 0; n < BASELINE_FILL; n++) {
    subject.next(volBaselineTick(n, n));
  }

  return BASELINE_FILL;
}

function scheduler(): TestScheduler {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

function fakePricing(subject: Subject<PriceTick>): PricingPort {
  return {
    getPriceUpdates: (symbol: string): Observable<PriceTick> => {
      return symbol === SYMBOL ? subject : of();
    },
    getPriceHistory: () => {
      return of([]);
    },
    getRfqQuote: () => {
      return of();
    },
  };
}

interface Rig {
  readonly tickSubject: Subject<PriceTick>;
  readonly preference$: Observable<JarvisNarratorPreference>;
  readonly narrate: ReturnType<typeof vi.fn<(prompt: string) => void>>;
  readonly ts: TestScheduler;
  readonly deps: NarratorDeps;
}

function buildRig(
  ts: TestScheduler,
  preference$: Observable<JarvisNarratorPreference> = of("on"),
  symbols$: Observable<readonly string[]> = of([SYMBOL]),
): Rig {
  const tickSubject = new Subject<PriceTick>();
  const narrate = vi.fn<(prompt: string) => void>();
  const deps: NarratorDeps = {
    pricing: fakePricing(tickSubject),
    symbols$,
    narrate,
    preference$,
    scheduler: ts,
    config: CFG,
  };

  return { tickSubject, preference$, narrate, ts, deps };
}
