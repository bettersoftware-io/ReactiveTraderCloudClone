import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import {
  type CurrencyPair,
  KNOWN_CURRENCY_PAIRS,
  type Price,
  PriceMovementType,
  type PriceTick,
  type PricingPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createPriceStreamPresenter } from "#/presenters/priceStream";

describe("createPriceStreamPresenter", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("memoises per pair", () => {
    const { pricing } = createCountingPricing();
    const p = createPriceStreamPresenter(
      useHost(),
      pricing,
      new BehaviorSubject<boolean>(false),
    );
    expect(p.price$(EURUSD)).toBe(p.price$(EURUSD));
    expect(p.price$(EURUSD)).not.toBe(p.price$(GBPUSD));
  });

  it("opens the port stream per warm period through the use case, never at construction", async () => {
    const { pricing, subscribes, observed } = createCountingPricing();
    const p = createPriceStreamPresenter(
      useHost(),
      pricing,
      new BehaviorSubject<boolean>(false),
    );
    const stream = p.price$(EURUSD);
    expect(subscribes()).toBe(0);
    const first = stream.subscribe(() => {});
    await tick();
    expect(subscribes()).toBe(1);
    expect(observed("EURUSD")).toBe(true);
    first.unsubscribe();
    await tick();
    expect(observed("EURUSD")).toBe(false);
    stream.subscribe(() => {}).unsubscribe();
    await tick();
    expect(subscribes()).toBe(2);
  });

  it("enriches each tick against the previous mid", async () => {
    const { pricing, push } = createCountingPricing();
    const p = createPriceStreamPresenter(
      useHost(),
      pricing,
      new BehaviorSubject<boolean>(false),
    );
    const seen: Price[] = [];
    p.price$(EURUSD).subscribe((price: Price) => {
      seen.push(price);
    });
    push(createTick("EURUSD", 1.1));
    push(createTick("EURUSD", 1.2));
    await tick();
    expect(
      seen.map((price) => {
        return price.mid;
      }),
    ).toEqual([1.1, 1.2]);
    expect(seen[1]?.movementType).toBe(PriceMovementType.UP);
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

interface CountingPricing {
  pricing: PricingPort;
  /** How many times a per-symbol stream has been SUBSCRIBED. */
  subscribes: () => number;
  observed: (symbol: string) => boolean;
  push: (tick: PriceTick) => void;
}

function createCountingPricing(): CountingPricing {
  const subjects = new Map<string, Subject<PriceTick>>();
  let count = 0;

  function subjectFor(symbol: string): Subject<PriceTick> {
    const existing = subjects.get(symbol);

    if (existing !== undefined) {
      return existing;
    }

    const fresh = new Subject<PriceTick>();
    subjects.set(symbol, fresh);
    return fresh;
  }

  return {
    pricing: {
      getPriceUpdates: (symbol: string) => {
        return new Observable<PriceTick>((subscriber) => {
          count += 1;
          return subjectFor(symbol).subscribe(subscriber);
        });
      },
      getPriceHistory: () => {
        return new Observable<readonly PriceTick[]>();
      },
      getRfqQuote: () => {
        return new Observable<never>();
      },
    },
    subscribes: () => {
      return count;
    },
    observed: (symbol: string) => {
      return subjects.get(symbol)?.observed ?? false;
    },
    push: (value: PriceTick) => {
      subjects.get(value.symbol)?.next(value);
    },
  };
}

function createTick(symbol: string, mid: number): PriceTick {
  return {
    symbol,
    bid: mid - 0.00005,
    ask: mid + 0.00005,
    mid,
    valueDate: "2026-01-03",
    creationTimestamp: 0,
  };
}

function findPair(symbol: string): CurrencyPair {
  const pair = KNOWN_CURRENCY_PAIRS.find((candidate) => {
    return candidate.symbol === symbol;
  });

  if (pair === undefined) {
    throw new Error(`${symbol} is not a known currency pair`);
  }

  return pair;
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const EURUSD = findPair("EURUSD");

const GBPUSD = findPair("GBPUSD");
