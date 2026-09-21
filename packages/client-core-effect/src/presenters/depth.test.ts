import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type { DepthBook, MarketDataPort } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createDepthPresenter } from "#/presenters/depth";

describe("depth presenter", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("memoises per symbol — one port CALL per symbol ever, one SUBSCRIPTION per warm period, released on the last unsubscribe", async () => {
    const scripted = createScriptedDepth();
    const p = createDepthPresenter(useHost(), scripted.port);
    expect(p.depth$("AAPL")).toBe(p.depth$("AAPL"));
    expect(p.depth$("AAPL")).not.toBe(p.depth$("MSFT"));
    // The port METHOD is called once per symbol, when the stream is
    // memoised; what a warm period owns is the SUBSCRIPTION to it.
    expect(scripted.calls("AAPL")).toBe(1);
    expect(scripted.subscribes("AAPL")).toBe(0);

    const seen: DepthBook[] = [];
    const sub = p.depth$("AAPL").subscribe((book: DepthBook) => {
      seen.push(book);
    });
    expect(scripted.subscribes("AAPL")).toBe(1);
    const book = createDepthBook("AAPL");
    scripted.emit(book);
    await tick();
    expect(seen).toEqual([book]);
    // Another symbol's book never reaches this one.
    scripted.emit(createDepthBook("MSFT"));
    await tick();
    expect(seen).toEqual([book]);

    sub.unsubscribe();
    await tick();
    expect(scripted.observed("AAPL")).toBe(false);

    p.depth$("AAPL").subscribe(() => {});
    expect(scripted.calls("AAPL")).toBe(1);
    expect(scripted.subscribes("AAPL")).toBe(2);
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

/** The one `MarketDataPort` method these cases drive, counted on
 * invocation. The rest throw so an unexpected call is visible. */
interface ScriptedDepth {
  port: MarketDataPort;
  calls: (symbol: string) => number;
  subscribes: (symbol: string) => number;
  observed: (symbol: string) => boolean;
  emit: (book: DepthBook) => void;
}

function createScriptedDepth(): ScriptedDepth {
  const books = new Map<string, Subject<DepthBook>>();
  const calls = new Map<string, number>();
  const subscribes = new Map<string, number>();

  function bookFor(symbol: string): Subject<DepthBook> {
    const existing = books.get(symbol);

    if (existing !== undefined) {
      return existing;
    }

    const fresh = new Subject<DepthBook>();
    books.set(symbol, fresh);
    return fresh;
  }

  return {
    port: {
      watchlist: (): never => {
        throw new Error("watchlist is not part of the depth presenter");
      },
      quotes: (): never => {
        throw new Error("quotes is not part of the depth presenter");
      },
      candles: (): never => {
        throw new Error("candles is not part of the depth presenter");
      },
      candleHistory: (): never => {
        throw new Error("candleHistory is not part of the depth presenter");
      },
      depth: (symbol: string) => {
        calls.set(symbol, (calls.get(symbol) ?? 0) + 1);
        return new Observable<DepthBook>((subscriber) => {
          subscribes.set(symbol, (subscribes.get(symbol) ?? 0) + 1);
          return bookFor(symbol).subscribe(subscriber);
        });
      },
    },
    calls: (symbol: string) => {
      return calls.get(symbol) ?? 0;
    },
    subscribes: (symbol: string) => {
      return subscribes.get(symbol) ?? 0;
    },
    observed: (symbol: string) => {
      return books.get(symbol)?.observed ?? false;
    },
    emit: (book: DepthBook) => {
      books.get(book.symbol)?.next(book);
    },
  };
}

function createDepthBook(symbol: string): DepthBook {
  return {
    symbol,
    bids: [{ price: 100, size: 10 }],
    asks: [{ price: 101, size: 10 }],
  };
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
