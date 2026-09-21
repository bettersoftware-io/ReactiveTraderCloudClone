import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { MarketDataPort } from "@rtc/domain";
import { CANDLE_HISTORY_RETRY_COOLDOWN_MS, type Candle } from "@rtc/domain";

import { createCandleSeriesPresenter } from "#/presenters/candleSeries";

describe("createCandleSeriesPresenter", () => {
  it('candles$("") never calls marketData.candles and yields an empty series synchronously', () => {
    let calls = 0;
    const marketData = createMarketDataStub(() => {
      calls += 1;
      return new Subject<readonly Candle[]>();
    });

    const presenter = createCandleSeriesPresenter(
      marketData,
      new AbortController().signal,
    );
    const seen: (readonly Candle[])[] = [];
    presenter.candles$("").subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([[]]);
    expect(calls).toBe(0);
  });

  it("now is injectable and the cooldown honours it without fake timers", async () => {
    const history: Subject<readonly Candle[]>[] = [];
    const marketData = createMarketDataStub(() => {
      const source = new Subject<readonly Candle[]>();
      history.push(source);
      return source;
    });
    let clock = 0;
    const presenter = createCandleSeriesPresenter(
      marketData,
      new AbortController().signal,
      () => {
        return clock;
      },
    );
    const base$ = new Subject<readonly Candle[]>();

    marketData.candles = (): Subject<readonly Candle[]> => {
      return base$;
    };

    presenter.candles$("AAPL").subscribe(() => {});
    base$.next([createCandle(1_000)]);
    await settle();

    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(1);
    history[0]?.error(new Error("bust"));
    await settle();

    // Within the cooldown: no retry.
    clock = CANDLE_HISTORY_RETRY_COOLDOWN_MS - 1;
    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(1);

    // At the boundary: a retry is allowed.
    clock = CANDLE_HISTORY_RETRY_COOLDOWN_MS;
    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(2);
  });

  it("a page landing after its period ended does not publish and the next period starts with older reset", async () => {
    const history: Subject<readonly Candle[]>[] = [];
    const marketData = createMarketDataStub(() => {
      const source = new Subject<readonly Candle[]>();
      history.push(source);
      return source;
    });
    const base$ = new Subject<readonly Candle[]>();

    marketData.candles = (): Subject<readonly Candle[]> => {
      return base$;
    };

    const presenter = createCandleSeriesPresenter(
      marketData,
      new AbortController().signal,
    );
    const sub = presenter.candles$("AAPL").subscribe(() => {});
    base$.next([createCandle(1_000)]);
    await settle();
    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(1);

    // Period ends: the last subscriber releases the port-backed topic.
    sub.unsubscribe();
    await settle();

    // The stale page lands after the period ended: nobody is subscribed to
    // throw through, and settling afterwards must not surface a rejection.
    history[0]?.next([createCandle(500)]);
    await settle();

    // A fresh period starts clean: no replay of the old base or the stale
    // page, and `older` is reset (a loadOlder before any base is a no-op).
    const values: (readonly Candle[])[] = [];
    presenter.candles$("AAPL").subscribe((v) => {
      values.push(v);
    });
    expect(values).toEqual([]);
    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(1);
  });

  it("lifetime.abort() abandons an in-flight page silently", async () => {
    const history: Subject<readonly Candle[]>[] = [];
    const marketData = createMarketDataStub(() => {
      const source = new Subject<readonly Candle[]>();
      history.push(source);
      return source;
    });
    const base$ = new Subject<readonly Candle[]>();

    marketData.candles = (): Subject<readonly Candle[]> => {
      return base$;
    };

    const lifetime = new AbortController();
    const presenter = createCandleSeriesPresenter(marketData, lifetime.signal);
    presenter.candles$("AAPL").subscribe(() => {});
    base$.next([createCandle(1_000)]);
    await settle();
    presenter.loadOlder("AAPL");
    await settle();
    expect(history).toHaveLength(1);
    expect(history[0]?.observed).toBe(true);

    expect(() => {
      lifetime.abort();
    }).not.toThrow();
    await settle();
    expect(history[0]?.observed).toBe(false);
  });
});

function createCandle(time: number, close = 100): Candle {
  return {
    time,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000,
  };
}

function createMarketDataStub(
  candleHistory: () => Subject<readonly Candle[]>,
): MarketDataPort {
  return {
    watchlist: () => {
      return new Subject();
    },
    quotes: () => {
      return new Subject();
    },
    candles: () => {
      return new Subject<readonly Candle[]>();
    },
    candleHistory,
    depth: () => {
      return new Subject();
    },
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
