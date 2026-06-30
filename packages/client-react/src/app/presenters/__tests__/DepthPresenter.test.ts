import { EMPTY, firstValueFrom, type Observable, of } from "rxjs";
import { describe, expect, it } from "vitest";

import type { DepthBook, MarketDataPort } from "@rtc/domain";

import { DepthPresenter } from "../DepthPresenter";

describe("DepthPresenter", () => {
  it("relays the port's depth book for a symbol", async () => {
    const presenter = new DepthPresenter(fakeMarketData([]));
    expect(await firstValueFrom(presenter.depth$("AAPL"))).toEqual(
      book("AAPL"),
    );
  });

  it("caches one stream per symbol — a repeat call returns the same Observable and hits the port once", () => {
    const calls: string[] = [];
    const presenter = new DepthPresenter(fakeMarketData(calls));
    const first = presenter.depth$("AAPL");
    const second = presenter.depth$("AAPL");
    expect(second).toBe(first);
    expect(calls).toEqual(["AAPL"]);
  });

  it("returns distinct cached streams for distinct symbols", () => {
    const calls: string[] = [];
    const presenter = new DepthPresenter(fakeMarketData(calls));
    const aapl = presenter.depth$("AAPL");
    const msft = presenter.depth$("MSFT");
    expect(msft).not.toBe(aapl);
    expect(calls).toEqual(["AAPL", "MSFT"]);
  });
});

function book(symbol: string): DepthBook {
  return {
    symbol,
    bids: [{ price: 100, size: 5 }],
    asks: [{ price: 101, size: 5 }],
  };
}

/** Minimal MarketDataPort fake: only `depth` is exercised here (it records the
 * symbols it was asked for so the cache contract can be asserted); the other
 * methods return EMPTY since this presenter never calls them. */
function fakeMarketData(depthCalls: string[]): MarketDataPort {
  return {
    watchlist: () => {
      return EMPTY;
    },
    quotes: () => {
      return EMPTY;
    },
    candles: () => {
      return EMPTY;
    },
    depth: (symbol: string): Observable<DepthBook> => {
      depthCalls.push(symbol);
      return of(book(symbol));
    },
  };
}
