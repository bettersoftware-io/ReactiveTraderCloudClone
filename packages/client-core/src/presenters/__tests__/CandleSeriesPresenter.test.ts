import {
  EMPTY,
  firstValueFrom,
  type Observable,
  of,
  Subject,
  throwError,
} from "rxjs";
import { describe, expect, it } from "vitest";

import {
  CANDLE_HISTORY_PAGE,
  type Candle,
  type CandleTimeframe,
  type MarketDataPort,
} from "@rtc/domain";

import { CandleSeriesPresenter } from "../CandleSeriesPresenter";

describe("CandleSeriesPresenter", () => {
  it("relays the port's candle series for a symbol, defaulting to '1D'", async () => {
    const calls: Array<[string, CandleTimeframe]> = [];
    const presenter = new CandleSeriesPresenter(fakeMarketData(calls));
    expect(await firstValueFrom(presenter.candles$("AAPL"))).toEqual(
      series("AAPL", "1D"),
    );
    expect(calls).toEqual([["AAPL", "1D"]]);
  });

  it("caches one stream per symbol — a repeat call returns the same Observable and hits the port once", () => {
    const calls: Array<[string, CandleTimeframe]> = [];
    const presenter = new CandleSeriesPresenter(fakeMarketData(calls));
    const first = presenter.candles$("AAPL");
    const second = presenter.candles$("AAPL");
    expect(second).toBe(first);
    expect(calls).toEqual([["AAPL", "1D"]]);
  });

  it("returns distinct cached streams for distinct symbols", () => {
    const calls: Array<[string, CandleTimeframe]> = [];
    const presenter = new CandleSeriesPresenter(fakeMarketData(calls));
    const aapl = presenter.candles$("AAPL");
    const msft = presenter.candles$("MSFT");
    expect(msft).not.toBe(aapl);
    expect(calls).toEqual([
      ["AAPL", "1D"],
      ["MSFT", "1D"],
    ]);
  });

  it("returns distinct cached streams for the same symbol at different timeframes", async () => {
    const calls: Array<[string, CandleTimeframe]> = [];
    const presenter = new CandleSeriesPresenter(fakeMarketData(calls));
    const oneDay = presenter.candles$("AAPL", "1D");
    const oneWeek = presenter.candles$("AAPL", "1W");
    expect(oneWeek).not.toBe(oneDay);
    expect(await firstValueFrom(oneWeek)).toEqual(series("AAPL", "1W"));
    expect(calls).toEqual([
      ["AAPL", "1D"],
      ["AAPL", "1W"],
    ]);
  });

  it("re-requesting the same symbol+timeframe pair hits the cache, not the port", () => {
    const calls: Array<[string, CandleTimeframe]> = [];
    const presenter = new CandleSeriesPresenter(fakeMarketData(calls));
    const first = presenter.candles$("AAPL", "3M");
    const second = presenter.candles$("AAPL", "3M");
    expect(second).toBe(first);
    expect(calls).toEqual([["AAPL", "3M"]]);
  });

  it("guards an empty symbol: emits [] synchronously without ever calling the port", async () => {
    const calls: Array<[string, CandleTimeframe]> = [];
    const presenter = new CandleSeriesPresenter(fakeMarketData(calls));
    expect(await firstValueFrom(presenter.candles$(""))).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("caches the empty-symbol guard stream by key, same as any real symbol", () => {
    const calls: Array<[string, CandleTimeframe]> = [];
    const presenter = new CandleSeriesPresenter(fakeMarketData(calls));
    const first = presenter.candles$("", "1D");
    const second = presenter.candles$("", "1D");
    expect(second).toBe(first);
    expect(calls).toEqual([]);
  });

  it("stitches a loaded older page in front of the base series, chronologically", () => {
    const base = [candle(200, 20), candle(300, 30)];
    const olderPage = [candle(100, 10)];
    const historyCalls: Array<[string, CandleTimeframe, number, number]> = [];
    const presenter = new CandleSeriesPresenter(
      scriptedMarketData({
        candles: () => {
          return of(base);
        },
        candleHistory: (
          symbol: string,
          timeframe: CandleTimeframe,
          beforeTime: number,
          count: number,
        ) => {
          historyCalls.push([symbol, timeframe, beforeTime, count]);
          return of(olderPage);
        },
      }),
    );

    const emissions: Array<readonly Candle[]> = [];
    presenter.candles$("AAPL").subscribe((s) => {
      emissions.push(s);
    });
    expect(emissions).toEqual([base]);

    presenter.loadOlder("AAPL");

    expect(historyCalls).toEqual([["AAPL", "1D", 200, CANDLE_HISTORY_PAGE]]);
    expect(emissions).toEqual([base, [...olderPage, ...base]]);
  });

  it("single-flight: two loadOlder calls while a page is pending make exactly ONE port call", () => {
    const base = [candle(200, 20)];
    const historyCalls: Array<[string, CandleTimeframe, number, number]> = [];
    const pending = new Subject<readonly Candle[]>();
    const presenter = new CandleSeriesPresenter(
      scriptedMarketData({
        candles: () => {
          return of(base);
        },
        candleHistory: (
          symbol: string,
          timeframe: CandleTimeframe,
          beforeTime: number,
          count: number,
        ) => {
          historyCalls.push([symbol, timeframe, beforeTime, count]);
          return pending;
        },
      }),
    );
    presenter.candles$("AAPL").subscribe();

    presenter.loadOlder("AAPL");
    presenter.loadOlder("AAPL");

    expect(historyCalls.length).toBe(1);

    pending.next([]);
    pending.complete();
  });

  it("a page shorter than CANDLE_HISTORY_PAGE latches historyExhausted$; a further loadOlder makes no port call", () => {
    const base = [candle(200, 20)];
    const shortPage = [candle(100, 10)];
    const historyCalls: Array<[string, CandleTimeframe, number, number]> = [];
    const presenter = new CandleSeriesPresenter(
      scriptedMarketData({
        candles: () => {
          return of(base);
        },
        candleHistory: (
          symbol: string,
          timeframe: CandleTimeframe,
          beforeTime: number,
          count: number,
        ) => {
          historyCalls.push([symbol, timeframe, beforeTime, count]);
          return of(shortPage);
        },
      }),
    );
    presenter.candles$("AAPL").subscribe();

    const exhaustedValues: boolean[] = [];
    presenter.historyExhausted$("AAPL").subscribe((v) => {
      exhaustedValues.push(v);
    });

    presenter.loadOlder("AAPL");
    expect(exhaustedValues).toEqual([false, true]);

    presenter.loadOlder("AAPL");
    expect(historyCalls.length).toBe(1);
  });

  it("a candleHistory error clears loadingOlder$ WITHOUT latching exhaustion; a subsequent loadOlder retries the port", async () => {
    const base = [candle(200, 20)];
    const historyCalls: Array<[string, CandleTimeframe, number, number]> = [];
    let attempt = 0;
    const presenter = new CandleSeriesPresenter(
      scriptedMarketData({
        candles: () => {
          return of(base);
        },
        candleHistory: (
          symbol: string,
          timeframe: CandleTimeframe,
          beforeTime: number,
          count: number,
        ) => {
          historyCalls.push([symbol, timeframe, beforeTime, count]);
          attempt += 1;
          return attempt === 1
            ? throwError(() => {
                return new Error("boom");
              })
            : of([]);
        },
      }),
    );
    presenter.candles$("AAPL").subscribe();

    const loadingValues: boolean[] = [];
    presenter.loadingOlder$("AAPL").subscribe((v) => {
      loadingValues.push(v);
    });

    presenter.loadOlder("AAPL");

    expect(loadingValues).toEqual([false, true, false]);
    expect(await firstValueFrom(presenter.historyExhausted$("AAPL"))).toBe(
      false,
    );

    presenter.loadOlder("AAPL");
    expect(historyCalls.length).toBe(2);
  });

  it("contiguity guard: a page whose last candle's time >= the current first candle's time has the overlap dropped", () => {
    const base = [candle(200, 20), candle(300, 30)];
    // 200 duplicates base's first candle's time — must NOT survive; only
    // strictly-older 100 does.
    const overlappingPage = [candle(100, 10), candle(200, 99)];
    const historyCalls: Array<[string, CandleTimeframe, number, number]> = [];
    const presenter = new CandleSeriesPresenter(
      scriptedMarketData({
        candles: () => {
          return of(base);
        },
        candleHistory: (
          symbol: string,
          timeframe: CandleTimeframe,
          beforeTime: number,
          count: number,
        ) => {
          historyCalls.push([symbol, timeframe, beforeTime, count]);
          return of(overlappingPage);
        },
      }),
    );

    const emissions: Array<readonly Candle[]> = [];
    presenter.candles$("AAPL").subscribe((s) => {
      emissions.push(s);
    });

    presenter.loadOlder("AAPL");

    expect(emissions).toEqual([base, [candle(100, 10), ...base]]);
  });

  it("per-key independence: loadOlder for (AAPL,1D) leaves (AAPL,1W)'s stitched stream and flags untouched", async () => {
    const base1D = [candle(200, 20)];
    const base1W = [candle(500, 50)];
    const olderPage = [candle(100, 10)];
    const historyCalls: Array<[string, CandleTimeframe, number, number]> = [];
    const presenter = new CandleSeriesPresenter(
      scriptedMarketData({
        candles: (_symbol: string, timeframe: CandleTimeframe) => {
          return of(timeframe === "1W" ? base1W : base1D);
        },
        candleHistory: (
          symbol: string,
          timeframe: CandleTimeframe,
          beforeTime: number,
          count: number,
        ) => {
          historyCalls.push([symbol, timeframe, beforeTime, count]);
          return of(olderPage);
        },
      }),
    );

    const emissions1D: Array<readonly Candle[]> = [];
    const emissions1W: Array<readonly Candle[]> = [];
    presenter.candles$("AAPL", "1D").subscribe((s) => {
      emissions1D.push(s);
    });
    presenter.candles$("AAPL", "1W").subscribe((s) => {
      emissions1W.push(s);
    });

    presenter.loadOlder("AAPL", "1D");

    expect(historyCalls).toEqual([["AAPL", "1D", 200, CANDLE_HISTORY_PAGE]]);
    expect(emissions1D).toEqual([base1D, [...olderPage, ...base1D]]);
    expect(emissions1W).toEqual([base1W]);
    expect(await firstValueFrom(presenter.loadingOlder$("AAPL", "1W"))).toBe(
      false,
    );
    expect(
      await firstValueFrom(presenter.historyExhausted$("AAPL", "1W")),
    ).toBe(false);
  });

  it("beforeTime tracks the current oldest stitched candle: first call uses the base's oldest, the next uses the prior page's oldest", () => {
    const base = [candle(300, 30)];
    // page1 must be a FULL page (length === CANDLE_HISTORY_PAGE) so it
    // doesn't latch exhaustion and block the second loadOlder call; only
    // its first (oldest) candle's time matters for this assertion.
    const page1 = [
      candle(200, 20),
      ...Array.from({ length: CANDLE_HISTORY_PAGE - 1 }, (_, i) => {
        return candle(250, i);
      }),
    ];
    const page2 = [candle(100, 10)];
    const historyCalls: Array<[string, CandleTimeframe, number, number]> = [];
    let call = 0;
    const presenter = new CandleSeriesPresenter(
      scriptedMarketData({
        candles: () => {
          return of(base);
        },
        candleHistory: (
          symbol: string,
          timeframe: CandleTimeframe,
          beforeTime: number,
          count: number,
        ) => {
          historyCalls.push([symbol, timeframe, beforeTime, count]);
          call += 1;
          return of(call === 1 ? page1 : page2);
        },
      }),
    );
    presenter.candles$("AAPL").subscribe();

    presenter.loadOlder("AAPL");
    presenter.loadOlder("AAPL");

    expect(historyCalls).toEqual([
      ["AAPL", "1D", 300, CANDLE_HISTORY_PAGE],
      ["AAPL", "1D", 200, CANDLE_HISTORY_PAGE],
    ]);
  });

  it("loadOlder before any candles$ emission is a no-op: no port call", () => {
    const historyCalls: Array<[string, CandleTimeframe, number, number]> = [];
    const presenter = new CandleSeriesPresenter(
      scriptedMarketData({
        candles: () => {
          return of([candle(200, 20)]);
        },
        candleHistory: (
          symbol: string,
          timeframe: CandleTimeframe,
          beforeTime: number,
          count: number,
        ) => {
          historyCalls.push([symbol, timeframe, beforeTime, count]);
          return of([]);
        },
      }),
    );

    // candles$ is called (creating the stitched stream) but never
    // subscribed, so it never emits and latestFirst stays null.
    presenter.candles$("AAPL");
    presenter.loadOlder("AAPL");

    expect(historyCalls).toEqual([]);
  });
});

function series(symbol: string, timeframe: CandleTimeframe): readonly Candle[] {
  // One deterministic candle; the symbol+timeframe seed `open` so distinct
  // pairs yield distinguishable series.
  const seed = symbol.charCodeAt(0) + timeframe.charCodeAt(1);
  return [
    {
      time: 1,
      open: seed,
      high: seed + 1,
      low: seed - 1,
      close: seed,
      volume: 1_200_000,
    },
  ];
}

/** Minimal MarketDataPort fake: only `candles` is exercised here (recording the
 * symbol+timeframe pairs requested so the cache contract can be asserted); the
 * others return EMPTY since this presenter never calls them. */
function fakeMarketData(
  candleCalls: Array<[string, CandleTimeframe]>,
): MarketDataPort {
  return {
    watchlist: () => {
      return EMPTY;
    },
    quotes: () => {
      return EMPTY;
    },
    depth: () => {
      return EMPTY;
    },
    candleHistory: () => {
      return of([]);
    },
    candles: (
      symbol: string,
      timeframe: CandleTimeframe = "1D",
    ): Observable<readonly Candle[]> => {
      candleCalls.push([symbol, timeframe]);
      return of(series(symbol, timeframe));
    },
  };
}

/** One deterministic candle at a given `time`, distinguishable by `seed`. */
function candle(time: number, seed: number): Candle {
  return {
    time,
    open: seed,
    high: seed + 1,
    low: seed - 1,
    close: seed,
    volume: 1_200_000,
  };
}

/** Overrides accepted by {@link scriptedMarketData}: both `candles` and
 * `candleHistory` are supplied per-case so each test controls its own base
 * series / history pages and can record the exact calls made to either. */
interface ScriptedMarketDataOverrides {
  candles: (
    symbol: string,
    timeframe: CandleTimeframe,
  ) => Observable<readonly Candle[]>;
  candleHistory: (
    symbol: string,
    timeframe: CandleTimeframe,
    beforeTime: number,
    count: number,
  ) => Observable<readonly Candle[]>;
}

/** A fully scripted MarketDataPort fake for the backfill-stitching tests
 * below — see {@link ScriptedMarketDataOverrides}. `watchlist`/`quotes`/
 * `depth` are never exercised by this presenter, so they return EMPTY. */
function scriptedMarketData(
  overrides: ScriptedMarketDataOverrides,
): MarketDataPort {
  return {
    watchlist: () => {
      return EMPTY;
    },
    quotes: () => {
      return EMPTY;
    },
    depth: () => {
      return EMPTY;
    },
    candleHistory: overrides.candleHistory,
    candles: (symbol: string, timeframe: CandleTimeframe = "1D") => {
      return overrides.candles(symbol, timeframe);
    },
  };
}
