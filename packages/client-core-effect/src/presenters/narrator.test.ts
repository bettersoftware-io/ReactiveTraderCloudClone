import { BehaviorSubject, of, Subject, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CurrencyPair,
  JarvisNarratorPreference,
  PriceTick,
} from "@rtc/domain";
import { NARRATION_COOLDOWN_MS } from "@rtc/domain";

import { createDetachedHost } from "#/bridge/out";
import { createNarrator } from "#/presenters/narrator";

// The Effect-only paths: the preference read at anomaly time (switched off
// mid-session), and one pair's failing price stream leaving the others
// narrating.
describe("createNarrator (Effect core)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a preference switched off mid-session drops the next anomaly", async () => {
    const rig = createRig();
    await vi.advanceTimersByTimeAsync(0);

    await rig.pushAnomaly("EURUSD");
    expect(rig.narrations).toHaveLength(1);

    rig.preference$.next("off");
    await vi.advanceTimersByTimeAsync(NARRATION_COOLDOWN_MS);
    await rig.pushAnomaly("EURUSD");

    expect(rig.narrations).toHaveLength(1);
  });

  it("one pair's failing price stream silences that pair, never the others", async () => {
    const rig = createRig({ failing: "GBPUSD" });
    await vi.advanceTimersByTimeAsync(0);

    await rig.pushAnomaly("EURUSD");

    expect(rig.narrations).toHaveLength(1);
    expect(rig.narrations[0]).toContain("EURUSD");
  });
});

interface Rig {
  readonly narrations: string[];
  readonly preference$: BehaviorSubject<JarvisNarratorPreference>;
  pushAnomaly(symbol: string): Promise<void>;
}

interface RigOptions {
  readonly failing?: string;
}

function createRig(options: RigOptions = {}): Rig {
  const prices = new Map<string, Subject<PriceTick>>();
  const preference$ = new BehaviorSubject<JarvisNarratorPreference>("on");
  const narrations: string[] = [];
  createNarrator(createDetachedHost(), {
    pairs$: of([createPair("EURUSD"), createPair("GBPUSD")]),
    priceFor: (pair: CurrencyPair) => {
      if (pair.symbol === options.failing) {
        return throwError(() => {
          return new Error("feed down");
        });
      }

      const subject = new Subject<PriceTick>();
      prices.set(pair.symbol, subject);
      return subject;
    },
    narrate: (prompt: string) => {
      narrations.push(prompt);
    },
    preference$,
    config: { windowSize: 400, minWindowFill: 4 },
  });
  return {
    narrations,
    preference$,
    pushAnomaly: async (symbol: string) => {
      const subject = prices.get(symbol);

      for (let i = 0; i < 60; i++) {
        subject?.next(createTick(symbol, i % 2 === 0 ? 0.00009 : 0.00011));
      }

      subject?.next(createTick(symbol, 0.025));
      await vi.advanceTimersByTimeAsync(0);
    },
  };
}

function createPair(symbol: string): CurrencyPair {
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

function createTick(symbol: string, halfSpread: number): PriceTick {
  return {
    symbol,
    bid: 1.1 - halfSpread,
    ask: 1.1 + halfSpread,
    mid: 1.1,
    valueDate: "2026-01-01",
    creationTimestamp: 0,
  };
}
