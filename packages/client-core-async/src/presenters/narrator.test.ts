import { BehaviorSubject, of, Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import type {
  CurrencyPair,
  JarvisNarratorPreference,
  PriceTick,
} from "@rtc/domain";

import { createNarrator } from "#/presenters/narrator";

// The async-only paths: the preference read at anomaly time (switched off
// mid-session), and one pair's failing price stream leaving the others
// narrating.
describe("createNarrator (async core)", () => {
  it("a preference switched off mid-session drops the next anomaly", () => {
    const rig = createRig();

    rig.pushAnomaly("EURUSD");
    expect(rig.narrations).toHaveLength(1);

    rig.preference$.next("off");
    rig.now = CLEAR_OF_COOLDOWN;
    rig.pushAnomaly("EURUSD");

    expect(rig.narrations).toHaveLength(1);
  });

  it("one pair's failing price stream silences that pair, never the others", () => {
    const rig = createRig({ failing: "GBPUSD" });

    rig.pushAnomaly("EURUSD");

    expect(rig.narrations).toHaveLength(1);
    expect(rig.narrations[0]).toContain("EURUSD");
  });
});

const CLEAR_OF_COOLDOWN = 10_000_000;

interface Rig {
  readonly narrations: string[];
  readonly preference$: BehaviorSubject<JarvisNarratorPreference>;
  now: number;
  pushAnomaly(symbol: string): void;
}

interface RigOptions {
  readonly failing?: string;
}

function createRig(options: RigOptions = {}): Rig {
  const prices = new Map<string, Subject<PriceTick>>();
  const preference$ = new BehaviorSubject<JarvisNarratorPreference>("on");
  const rig: Rig = {
    narrations: [],
    preference$,
    now: 0,
    pushAnomaly: (symbol: string) => {
      const subject = prices.get(symbol);

      for (let i = 0; i < 60; i++) {
        subject?.next(createTick(symbol, i % 2 === 0 ? 0.00009 : 0.00011));
      }

      subject?.next(createTick(symbol, 0.025));
    },
  };
  createNarrator(
    {
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
        rig.narrations.push(prompt);
      },
      preference$,
      config: { windowSize: 400, minWindowFill: 4 },
      now: () => {
        return rig.now;
      },
    },
    new AbortController().signal,
  );
  return rig;
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
