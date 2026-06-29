import { firstValueFrom, of, Subject, take } from "rxjs";
import { describe, expect, it } from "vitest";

import type {
  Candle,
  DepthBook,
  EquityInstrument,
  EquityQuote,
  MarketDataPort,
} from "@rtc/domain";

import { WatchlistPresenter } from "./WatchlistPresenter";

describe("WatchlistPresenter", () => {
  it("emits the watchlist instruments", async () => {
    const instruments = [instrument("AAPL"), instrument("MSFT")];
    const port = makePort(instruments, quote);
    const presenter = new WatchlistPresenter(port);
    const result = await firstValueFrom(presenter.watchlist$.pipe(take(1)));
    expect(result).toHaveLength(2);
    expect(result[0].symbol).toBe("AAPL");
  });

  it("returns the same Observable reference for quote$ on the same symbol (cached)", () => {
    const port = makePort([instrument("AAPL")], quote);
    const presenter = new WatchlistPresenter(port);
    const first = presenter.quote$("AAPL");
    const second = presenter.quote$("AAPL");
    expect(first).toBe(second);
  });

  it("returns different Observable references for different symbols", () => {
    const port = makePort([instrument("AAPL"), instrument("MSFT")], quote);
    const presenter = new WatchlistPresenter(port);
    const aapl = presenter.quote$("AAPL");
    const msft = presenter.quote$("MSFT");
    expect(aapl).not.toBe(msft);
  });

  it("quote$ emits a quote for the given symbol", async () => {
    const port = makePort([instrument("AAPL")], (s) => {
      return quote(s);
    });
    const presenter = new WatchlistPresenter(port);
    const result = await firstValueFrom(presenter.quote$("AAPL").pipe(take(1)));
    expect(result.symbol).toBe("AAPL");
  });
});

function instrument(symbol: string): EquityInstrument {
  return { symbol, name: symbol, exchange: "NASDAQ" };
}

function quote(symbol: string): EquityQuote {
  return {
    symbol,
    bid: 100,
    ask: 101,
    last: 100,
    changePct: 0,
    timestamp: Date.now(),
  };
}

function makePort(
  instruments: EquityInstrument[],
  quoteFor: (symbol: string) => EquityQuote,
): MarketDataPort {
  return {
    watchlist: () => {
      return of(instruments);
    },
    quotes: (symbol: string) => {
      return of(quoteFor(symbol));
    },
    candles: (_symbol: string): ReturnType<MarketDataPort["candles"]> => {
      return new Subject<readonly Candle[]>();
    },
    depth: (_symbol: string): ReturnType<MarketDataPort["depth"]> => {
      return new Subject<DepthBook>();
    },
  };
}
