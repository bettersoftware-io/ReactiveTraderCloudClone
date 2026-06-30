import { EMPTY, firstValueFrom, type Observable, of } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Candle, MarketDataPort } from "@rtc/domain";

import { CandleSeriesPresenter } from "../CandleSeriesPresenter";

describe("CandleSeriesPresenter", () => {
  it("relays the port's candle series for a symbol", async () => {
    const presenter = new CandleSeriesPresenter(fakeMarketData([]));
    expect(await firstValueFrom(presenter.candles$("AAPL"))).toEqual(
      series("AAPL"),
    );
  });

  it("caches one stream per symbol — a repeat call returns the same Observable and hits the port once", () => {
    const calls: string[] = [];
    const presenter = new CandleSeriesPresenter(fakeMarketData(calls));
    const first = presenter.candles$("AAPL");
    const second = presenter.candles$("AAPL");
    expect(second).toBe(first);
    expect(calls).toEqual(["AAPL"]);
  });

  it("returns distinct cached streams for distinct symbols", () => {
    const calls: string[] = [];
    const presenter = new CandleSeriesPresenter(fakeMarketData(calls));
    const aapl = presenter.candles$("AAPL");
    const msft = presenter.candles$("MSFT");
    expect(msft).not.toBe(aapl);
    expect(calls).toEqual(["AAPL", "MSFT"]);
  });
});

function series(symbol: string): readonly Candle[] {
  // One deterministic candle; the symbol seeds `open` so distinct symbols yield
  // distinguishable series.
  const seed = symbol.charCodeAt(0);
  return [{ time: 1, open: seed, high: seed + 1, low: seed - 1, close: seed }];
}

/** Minimal MarketDataPort fake: only `candles` is exercised here (recording the
 * symbols requested so the cache contract can be asserted); the others return
 * EMPTY since this presenter never calls them. */
function fakeMarketData(candleCalls: string[]): MarketDataPort {
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
    candles: (symbol: string): Observable<readonly Candle[]> => {
      candleCalls.push(symbol);
      return of(series(symbol));
    },
  };
}
