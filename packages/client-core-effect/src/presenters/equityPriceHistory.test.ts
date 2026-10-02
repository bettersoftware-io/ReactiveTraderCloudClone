import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Stream } from "@rtc/core-api";
import type { EquityQuote, MarketDataPort } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createEquityPriceHistoryPresenter } from "#/presenters/equityPriceHistory";

describe("createEquityPriceHistoryPresenter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();

    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("memoises per symbol and a never-mounted symbol seeds None", () => {
    const { port } = createPort();
    const p = createEquityPriceHistoryPresenter(useHost(), port, calm(false));
    expect(p.history$("MSFT")).toBe(p.history$("MSFT"));
    expect(p.history$("MSFT")).not.toBe(p.history$("AAPL"));
    const seen = collect(p.history$("AAPL"));
    expect(seen).toEqual([]);
  });

  it("a Some seed: the retained window is delivered synchronously on resubscribe, and the port is released in between", async () => {
    const { port, push, observed } = createPort();
    const p = createEquityPriceHistoryPresenter(useHost(), port, calm(false));
    const stream = p.history$("MSFT");
    const first = stream.subscribe(() => {});
    push(createTick("MSFT", 1));
    push(createTick("MSFT", 2));
    await tick();
    first.unsubscribe();
    await tick();
    expect(observed("MSFT")).toBe(false);
    const again = collect(stream);
    expect(lasts(again[0] ?? [])).toEqual([1, 2]);
    push(createTick("MSFT", 3));
    await tick();
    expect(lasts(again.at(-1) ?? [])).toEqual([1, 2, 3]);
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

interface TestPort {
  port: MarketDataPort;
  observed: (symbol: string) => boolean;
  push: (value: EquityQuote) => void;
}

function createPort(): TestPort {
  const subjects = new Map<string, Subject<EquityQuote>>();

  function subjectFor(symbol: string): Subject<EquityQuote> {
    const existing = subjects.get(symbol);

    if (existing !== undefined) {
      return existing;
    }

    const fresh = new Subject<EquityQuote>();
    subjects.set(symbol, fresh);
    return fresh;
  }

  return {
    port: {
      watchlist: () => {
        return new Observable<never>();
      },
      quotes: (symbol: string) => {
        return new Observable<EquityQuote>((subscriber) => {
          return subjectFor(symbol).subscribe(subscriber);
        });
      },
      candles: () => {
        return new Observable<never>();
      },
      candleHistory: () => {
        return new Observable<never>();
      },
      depth: () => {
        return new Observable<never>();
      },
    },
    observed: (symbol: string) => {
      return subjects.get(symbol)?.observed ?? false;
    },
    push: (value: EquityQuote) => {
      subjects.get(value.symbol)?.next(value);
    },
  };
}

function calm(on: boolean): BehaviorSubject<boolean> {
  return new BehaviorSubject<boolean>(on);
}

function collect(
  stream: Stream<readonly EquityQuote[]>,
): (readonly EquityQuote[])[] {
  const values: (readonly EquityQuote[])[] = [];
  stream.subscribe((value: readonly EquityQuote[]) => {
    values.push(value);
  });
  return values;
}

function lasts(window: readonly EquityQuote[]): number[] {
  return window.map((value) => {
    return value.last;
  });
}

function createTick(symbol: string, last: number): EquityQuote {
  return {
    symbol,
    bid: last,
    ask: last,
    last,
    changePct: 0,
    timestamp: last,
  };
}

/** Lets the pending fibre hops run. Under fake timers, so the flush is driven
 * rather than raced against a real clock. */
function tick(): Promise<unknown> {
  return vi.advanceTimersByTimeAsync(0);
}
