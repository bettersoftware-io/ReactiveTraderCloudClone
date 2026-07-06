import { EMPTY, firstValueFrom, type Observable, of } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Candle, CandleTimeframe, MarketDataPort } from "@rtc/domain";

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
});

function series(symbol: string, timeframe: CandleTimeframe): readonly Candle[] {
  // One deterministic candle; the symbol+timeframe seed `open` so distinct
  // pairs yield distinguishable series.
  const seed = symbol.charCodeAt(0) + timeframe.charCodeAt(1);
  return [{ time: 1, open: seed, high: seed + 1, low: seed - 1, close: seed }];
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
    candles: (
      symbol: string,
      timeframe: CandleTimeframe = "1D",
    ): Observable<readonly Candle[]> => {
      candleCalls.push([symbol, timeframe]);
      return of(series(symbol, timeframe));
    },
  };
}
