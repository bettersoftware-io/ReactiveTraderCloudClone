import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import {
  CANDLE_HISTORY_PAGE,
  CANDLE_HISTORY_RETRY_COOLDOWN_MS,
  type Candle,
  type CandleTimeframe,
  type MarketDataPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createCandleSeriesPresenter } from "#/presenters/candleSeries";

describe("candleSeries presenter", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("an empty symbol never calls marketData.candles, and loadOlder on it asks for no page", async () => {
    const scripted = createScriptedCandles();
    const p = createCandleSeriesPresenter(useHost(), scripted.port);
    const seen: (readonly Candle[])[] = [];
    p.candles$("").subscribe((series: readonly Candle[]) => {
      seen.push(series);
    });
    expect(seen).toEqual([[]]);
    p.loadOlder("");
    await tick();
    expect(scripted.candleCalls("", "1D")).toBe(0);
    expect(scripted.pendingHistory()).toEqual([]);
  });

  it("the cooldown reads the INJECTED clock: a retry is blocked inside it and allowed at the boundary", async () => {
    const scripted = createScriptedCandles();
    let clock = T0;
    const p = createCandleSeriesPresenter(useHost(), scripted.port, () => {
      return clock;
    });
    const series = p.candles$("AAPL").subscribe(() => {});
    await tick();
    scripted.emitCandles("AAPL", "1D", createCandles(3, T0, STEP_MS));
    await tick();
    p.loadOlder("AAPL");
    await tick();
    expect(scripted.pendingHistory()).toHaveLength(1);
    scripted.failHistory(new Error("bust"));
    await tick();

    p.loadOlder("AAPL");
    await tick();
    expect(scripted.pendingHistory()).toEqual([]);
    clock = T0 + CANDLE_HISTORY_RETRY_COOLDOWN_MS - 1;
    p.loadOlder("AAPL");
    await tick();
    expect(scripted.pendingHistory()).toEqual([]);
    // Equal to the cooldown allows — strictly inside blocks.
    clock = T0 + CANDLE_HISTORY_RETRY_COOLDOWN_MS;
    p.loadOlder("AAPL");
    await tick();
    expect(scripted.pendingHistory()).toHaveLength(1);
    series.unsubscribe();
  });

  it("a nudge offered between warm periods is never stitched into the next one", async () => {
    const scripted = createScriptedCandles();
    const p = createCandleSeriesPresenter(useHost(), scripted.port);
    const base = createCandles(3, T0, STEP_MS);
    const first = p.candles$("AAPL").subscribe(() => {});
    await tick();
    scripted.emitCandles("AAPL", "1D", base);
    await tick();
    p.loadOlder("AAPL");
    await tick();

    // The period ends while the page is still in flight, so the page lands
    // on a queue nobody drains.
    first.unsubscribe();
    await tick();
    expect(scripted.candlesObserved("AAPL", "1D")).toBe(false);
    scripted.resolveHistory(
      createCandles(
        CANDLE_HISTORY_PAGE,
        T0 - CANDLE_HISTORY_PAGE * STEP_MS,
        STEP_MS,
      ),
    );
    await tick();

    const again: (readonly Candle[])[] = [];
    p.candles$("AAPL").subscribe((value: readonly Candle[]) => {
      again.push(value);
    });
    expect(again).toEqual([]);
    await tick();
    scripted.emitCandles("AAPL", "1D", base);
    await tick();
    // The fresh period reset `older`, so the page that landed between
    // periods contributes nothing — the base alone.
    expect(times(again.at(-1))).toEqual(times(base));
  });

  it("a page landing into a fresh period BEFORE its base publishes nothing, then joins the base when it arrives", async () => {
    const scripted = createScriptedCandles();
    const p = createCandleSeriesPresenter(useHost(), scripted.port);
    const base = createCandles(3, T0, STEP_MS);
    const first = p.candles$("AAPL").subscribe(() => {});
    await tick();
    scripted.emitCandles("AAPL", "1D", base);
    await tick();
    p.loadOlder("AAPL");
    await tick();
    first.unsubscribe();
    await tick();

    // The NEW period is open (and has reset `older`) when the page from the
    // old one lands, so the nudge reaches a drained queue with no base yet.
    const again: (readonly Candle[])[] = [];
    p.candles$("AAPL").subscribe((value: readonly Candle[]) => {
      again.push(value);
    });
    await tick();
    const pageStart = T0 - CANDLE_HISTORY_PAGE * STEP_MS;
    scripted.resolveHistory(
      createCandles(CANDLE_HISTORY_PAGE, pageStart, STEP_MS),
    );
    await tick();
    expect(again).toEqual([]);

    // Once the base arrives the page IS stitched in — an in-flight fetch
    // from a torn-down period is not cancelled, exactly as in the RxJS
    // presenter.
    scripted.emitCandles("AAPL", "1D", base);
    await tick();
    expect(again.at(-1)).toHaveLength(CANDLE_HISTORY_PAGE + base.length);
    expect(again.at(-1)?.[0]?.time).toBe(pageStart);
  });

  it("closing the host scope mid-page abandons the fetch: the port is released and Effect.ensuring still clears the key", async () => {
    const scripted = createScriptedCandles();
    const host = useHost();
    const p = createCandleSeriesPresenter(host, scripted.port);
    p.candles$("AAPL").subscribe(() => {});
    await tick();
    scripted.emitCandles("AAPL", "1D", createCandles(3, T0, STEP_MS));
    await tick();

    const loading: boolean[] = [];
    const watching = p.loadingOlder$("AAPL").subscribe((value: boolean) => {
      loading.push(value);
    });
    p.loadOlder("AAPL");
    await tick();
    expect(scripted.pendingHistory()).toHaveLength(1);
    expect(scripted.historyObserved()).toBe(true);
    expect(loading.at(-1)).toBe(true);
    // Dropped so the cell goes cold: while a subscriber holds `state()` at
    // refCount 1 a later read is its cache, not the ref.
    watching.unsubscribe();
    await tick();

    // `app.dispose()`'s path while the page is still in flight.
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    // `rpc`'s finalizer ran: the history request is no longer subscribed.
    expect(scripted.historyObserved()).toBe(false);
    expect(scripted.pendingHistory()).toEqual([]);

    // `Effect.ensuring` runs on interruption too, so the key is not left
    // wedged with `inFlight` true. `inFlight` itself is internal; the
    // honest proxy is the `loading` cell it is cleared beside, read cold so
    // the value comes from the ref rather than a cache.
    const afterClose: boolean[] = [];
    p.loadingOlder$("AAPL").subscribe((value: boolean) => {
      afterClose.push(value);
    });
    expect(afterClose).toEqual([false]);
  });

  it("loadOlder before the series has emitted asks for nothing — there is no anchor yet", async () => {
    const scripted = createScriptedCandles();
    const p = createCandleSeriesPresenter(useHost(), scripted.port);
    p.candles$("AAPL").subscribe(() => {});
    await tick();
    p.loadOlder("AAPL");
    await tick();
    expect(scripted.pendingHistory()).toEqual([]);
  });

  it("loadingOlder$ and historyExhausted$ hand back the SAME instance per key, and the cell survives warm periods", async () => {
    const scripted = createScriptedCandles();
    const p = createCandleSeriesPresenter(useHost(), scripted.port);
    // Memoised per key, like the RxJS core's `BehaviorSubject`s — a caller
    // that re-reads the accessor keeps the same cell rather than a fresh
    // view of it.
    expect(p.historyExhausted$("AAPL")).toBe(p.historyExhausted$("AAPL"));
    expect(p.loadingOlder$("AAPL")).toBe(p.loadingOlder$("AAPL"));
    expect(p.historyExhausted$("AAPL")).not.toBe(p.historyExhausted$("MSFT"));
    expect(p.historyExhausted$("AAPL")).not.toBe(p.loadingOlder$("AAPL"));
    expect(p.historyExhausted$("AAPL")).not.toBe(
      p.historyExhausted$("AAPL", "1W"),
    );

    const exhausted: boolean[] = [];
    p.historyExhausted$("AAPL").subscribe((value: boolean) => {
      exhausted.push(value);
    });
    expect(exhausted).toEqual([false]);

    const first = p.candles$("AAPL").subscribe(() => {});
    await tick();
    scripted.emitCandles("AAPL", "1D", createCandles(3, T0, STEP_MS));
    await tick();
    p.loadOlder("AAPL");
    await tick();
    // A SHORT page latches exhaustion on the cell a separate subscriber is
    // already watching.
    scripted.resolveHistory([createCandle(T0 - STEP_MS)]);
    await tick();
    expect(exhausted.at(-1)).toBe(true);

    first.unsubscribe();
    await tick();
    p.candles$("AAPL").subscribe(() => {});
    // The fresh period clears the very same cell — the watcher attached
    // since before the first period hears it, which is what "the SAME cell
    // across periods" means. It arrives a fiber hop later, as every ref
    // change reaches an existing subscriber.
    await tick();
    expect(exhausted.at(-1)).toBe(false);
    // Latched then cleared, not merely never latched.
    expect(exhausted).toContain(true);
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

/** What `candleHistory` was asked for. */
interface HistoryRequest {
  readonly symbol: string;
  readonly beforeTime: number;
  readonly count: number;
}

/** The two `MarketDataPort` methods these cases drive: a per-key candle
 * Subject and a FIFO of subscribed history requests (pending from SUBSCRIBE,
 * so "lazy" stays the presenter's property). */
interface ScriptedCandles {
  port: MarketDataPort;
  candleCalls: (symbol: string, timeframe: CandleTimeframe) => number;
  candlesObserved: (symbol: string, timeframe: CandleTimeframe) => boolean;
  emitCandles: (
    symbol: string,
    timeframe: CandleTimeframe,
    candles: readonly Candle[],
  ) => void;
  pendingHistory: () => readonly HistoryRequest[];
  /** Whether any history request is currently SUBSCRIBED — the release
   * witness for `rpc`'s finalizer. */
  historyObserved: () => boolean;
  resolveHistory: (page: readonly Candle[]) => void;
  failHistory: (error: unknown) => void;
}

/** One `candleHistory` request the presenter has SUBSCRIBED and the case
 * has not settled. */
interface PendingHistory {
  readonly request: HistoryRequest;
  readonly result: Subject<readonly Candle[]>;
}

function createScriptedCandles(): ScriptedCandles {
  const series = new Map<string, Subject<readonly Candle[]>>();
  const calls = new Map<string, number>();
  const history: PendingHistory[] = [];

  function seriesFor(key: string): Subject<readonly Candle[]> {
    const existing = series.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const fresh = new Subject<readonly Candle[]>();
    series.set(key, fresh);
    return fresh;
  }

  return {
    port: {
      watchlist: (): never => {
        throw new Error("watchlist is not part of the candle presenter");
      },
      quotes: (): never => {
        throw new Error("quotes is not part of the candle presenter");
      },
      candles: (symbol: string, timeframe: CandleTimeframe = "1D") => {
        const key = `${symbol}|${timeframe}`;
        calls.set(key, (calls.get(key) ?? 0) + 1);
        return seriesFor(key);
      },
      candleHistory: (
        symbol: string,
        _timeframe: CandleTimeframe,
        beforeTime: number,
        count: number,
      ) => {
        return new Observable<readonly Candle[]>((subscriber) => {
          const entry = {
            request: { symbol, beforeTime, count },
            result: new Subject<readonly Candle[]>(),
          };
          history.push(entry);
          const inner = entry.result.subscribe(subscriber);

          return () => {
            inner.unsubscribe();
            const at = history.indexOf(entry);

            if (at >= 0) {
              history.splice(at, 1);
            }
          };
        });
      },
      depth: (): never => {
        throw new Error("depth is not part of the candle presenter");
      },
    },
    candleCalls: (symbol: string, timeframe: CandleTimeframe) => {
      return calls.get(`${symbol}|${timeframe}`) ?? 0;
    },
    candlesObserved: (symbol: string, timeframe: CandleTimeframe) => {
      return series.get(`${symbol}|${timeframe}`)?.observed ?? false;
    },
    emitCandles: (
      symbol: string,
      timeframe: CandleTimeframe,
      candles: readonly Candle[],
    ) => {
      series.get(`${symbol}|${timeframe}`)?.next(candles);
    },
    pendingHistory: () => {
      return history.map((entry) => {
        return entry.request;
      });
    },
    historyObserved: () => {
      return history.some((entry) => {
        return entry.result.observed;
      });
    },
    resolveHistory: (page: readonly Candle[]) => {
      const oldest = history.shift();
      oldest?.result.next(page);
      oldest?.result.complete();
    },
    failHistory: (error: unknown) => {
      history.shift()?.result.error(error);
    },
  };
}

function createCandle(time: number): Candle {
  return { time, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 };
}

function createCandles(count: number, start: number, step: number): Candle[] {
  return Array.from({ length: count }, (_unused, index) => {
    return createCandle(start + index * step);
  });
}

function times(series: readonly Candle[] | undefined): number[] {
  return (series ?? []).map((candle) => {
    return candle.time;
  });
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const T0 = 1_700_000_000_000;

const STEP_MS = 60_000;
