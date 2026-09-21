import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Observable, ReplaySubject, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type {
  EquityInstrument,
  EquityQuote,
  MarketDataPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createWatchlistPresenter } from "#/presenters/watchlist";

describe("watchlist presenter", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("calls marketData.watchlist() ONCE, at construction, and keeps the roster warm across zero subscribers", async () => {
    const scripted = createScriptedMarketData();
    const host = useHost();
    const p = createWatchlistPresenter(host, scripted.port);
    expect(scripted.watchlistCalls()).toBe(1);
    const roster: readonly EquityInstrument[] = [createInstrument("AAPL")];
    const sub = p.watchlist$.subscribe(() => {});
    scripted.emitWatchlist(roster);
    await tick();
    sub.unsubscribe();
    await tick();
    expect(scripted.watchlistObserved()).toBe(true);
    const again: (readonly EquityInstrument[])[] = [];
    p.watchlist$.subscribe((value: readonly EquityInstrument[]) => {
      again.push(value);
    });
    expect(again).toEqual([roster]);
    expect(scripted.watchlistCalls()).toBe(1);
  });

  it("quote$ is memoised per symbol: one port CALL per symbol ever, one SUBSCRIPTION per warm period", async () => {
    const scripted = createScriptedMarketData();
    const p = createWatchlistPresenter(useHost(), scripted.port);
    expect(p.quote$("AAPL")).toBe(p.quote$("AAPL"));
    expect(p.quote$("AAPL")).not.toBe(p.quote$("MSFT"));
    // The port METHOD is called once per symbol, when the stream is
    // memoised; the SUBSCRIPTION is what a warm period owns and releases.
    expect(scripted.quoteCalls("AAPL")).toBe(1);
    expect(scripted.quoteSubscribes("AAPL")).toBe(0);
    const sub = p.quote$("AAPL").subscribe(() => {});
    expect(scripted.quoteSubscribes("AAPL")).toBe(1);
    sub.unsubscribe();
    await tick();
    expect(scripted.quoteObserved("AAPL")).toBe(false);
    p.quote$("AAPL").subscribe(() => {});
    expect(scripted.quoteCalls("AAPL")).toBe(1);
    expect(scripted.quoteSubscribes("AAPL")).toBe(2);
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

/** The two `MarketDataPort` methods these cases drive, each counted on
 * invocation, plus the roster's replay so a late first subscriber still
 * sees it. The other three methods throw: a call the cases do not expect
 * must be visible, not silently inert. */
interface ScriptedMarketData {
  port: MarketDataPort;
  watchlistCalls: () => number;
  watchlistObserved: () => boolean;
  emitWatchlist: (list: readonly EquityInstrument[]) => void;
  quoteCalls: (symbol: string) => number;
  quoteSubscribes: (symbol: string) => number;
  quoteObserved: (symbol: string) => boolean;
}

function createScriptedMarketData(): ScriptedMarketData {
  const roster = new ReplaySubject<readonly EquityInstrument[]>(1);
  const quotes = new Map<string, Subject<EquityQuote>>();
  const quoteCalls = new Map<string, number>();
  const quoteSubscribes = new Map<string, number>();
  let watchlistCalls = 0;

  function quoteFor(symbol: string): Subject<EquityQuote> {
    const existing = quotes.get(symbol);

    if (existing !== undefined) {
      return existing;
    }

    const fresh = new Subject<EquityQuote>();
    quotes.set(symbol, fresh);
    return fresh;
  }

  return {
    port: {
      watchlist: () => {
        watchlistCalls += 1;
        return roster;
      },
      quotes: (symbol: string) => {
        quoteCalls.set(symbol, (quoteCalls.get(symbol) ?? 0) + 1);
        return new Observable<EquityQuote>((subscriber) => {
          quoteSubscribes.set(symbol, (quoteSubscribes.get(symbol) ?? 0) + 1);
          return quoteFor(symbol).subscribe(subscriber);
        });
      },
      candles: (): never => {
        throw new Error("candles is not part of the watchlist presenter");
      },
      candleHistory: (): never => {
        throw new Error("candleHistory is not part of the watchlist presenter");
      },
      depth: (): never => {
        throw new Error("depth is not part of the watchlist presenter");
      },
    },
    watchlistCalls: () => {
      return watchlistCalls;
    },
    watchlistObserved: () => {
      return roster.observed;
    },
    emitWatchlist: (list: readonly EquityInstrument[]) => {
      roster.next(list);
    },
    quoteCalls: (symbol: string) => {
      return quoteCalls.get(symbol) ?? 0;
    },
    quoteSubscribes: (symbol: string) => {
      return quoteSubscribes.get(symbol) ?? 0;
    },
    quoteObserved: (symbol: string) => {
      return quotes.get(symbol)?.observed ?? false;
    },
  };
}

function createInstrument(symbol: string): EquityInstrument {
  return { symbol, name: `${symbol} Inc.`, exchange: "NASDAQ" };
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
