import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type { Stream } from "@rtc/core-api";
import type { PriceTick, PricingPort } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createPriceHistoryPresenter } from "#/presenters/priceHistory";

describe("createPriceHistoryPresenter", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("memoises per symbol and a never-mounted symbol seeds None", () => {
    const { pricing } = createPricing();
    const p = createPriceHistoryPresenter(useHost(), pricing, calm(false));
    expect(p.history$("EURUSD")).toBe(p.history$("EURUSD"));
    expect(p.history$("EURUSD")).not.toBe(p.history$("GBPUSD"));
    const seen = collect(p.history$("GBPUSD"));
    expect(seen).toEqual([]);
  });

  it("a Some seed: the retained window is delivered synchronously on resubscribe, and the port is released in between", async () => {
    const { pricing, push, observed } = createPricing();
    const p = createPriceHistoryPresenter(useHost(), pricing, calm(false));
    const stream = p.history$("EURUSD");
    const first = stream.subscribe(() => {});
    push(createTick("EURUSD", 1));
    push(createTick("EURUSD", 2));
    await tick();
    first.unsubscribe();
    await tick();
    expect(observed("EURUSD")).toBe(false);
    const again = collect(stream);
    expect(mids(again[0] ?? [])).toEqual([1, 2]);
    push(createTick("EURUSD", 3));
    await tick();
    expect(mids(again.at(-1) ?? [])).toEqual([1, 2, 3]);
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

interface TestPricing {
  pricing: PricingPort;
  observed: (symbol: string) => boolean;
  push: (value: PriceTick) => void;
}

function createPricing(): TestPricing {
  const subjects = new Map<string, Subject<PriceTick>>();

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
    observed: (symbol: string) => {
      return subjects.get(symbol)?.observed ?? false;
    },
    push: (value: PriceTick) => {
      subjects.get(value.symbol)?.next(value);
    },
  };
}

function calm(on: boolean): BehaviorSubject<boolean> {
  return new BehaviorSubject<boolean>(on);
}

function collect(
  stream: Stream<readonly PriceTick[]>,
): (readonly PriceTick[])[] {
  const values: (readonly PriceTick[])[] = [];
  stream.subscribe((value: readonly PriceTick[]) => {
    values.push(value);
  });
  return values;
}

function mids(window: readonly PriceTick[]): number[] {
  return window.map((value) => {
    return value.mid;
  });
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

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
