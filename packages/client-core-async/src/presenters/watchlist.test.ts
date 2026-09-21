import { BehaviorSubject, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type {
  EquityInstrument,
  EquityQuote,
  MarketDataPort,
} from "@rtc/domain";

import { createWatchlistPresenter } from "#/presenters/watchlist";

describe("createWatchlistPresenter", () => {
  it("lifetime.abort() releases the roster's port subscription", () => {
    const roster = new BehaviorSubject<readonly EquityInstrument[]>([]);
    const marketData = createMarketDataStub(roster);
    const lifetime = new AbortController();

    const presenter = createWatchlistPresenter(marketData, lifetime.signal);
    presenter.watchlist$.subscribe(() => {}).unsubscribe();
    expect(roster.observed).toBe(true);
    lifetime.abort();
    expect(roster.observed).toBe(false);
  });

  it("quote$(symbol) is memoised per symbol and delegates to marketData.quotes", () => {
    const marketData = createMarketDataStub(
      new BehaviorSubject<readonly EquityInstrument[]>([]),
    );

    const presenter = createWatchlistPresenter(
      marketData,
      new AbortController().signal,
    );

    expect(presenter.quote$("AAPL")).toBe(presenter.quote$("AAPL"));
    expect(presenter.quote$("AAPL")).not.toBe(presenter.quote$("MSFT"));
  });
});

function createMarketDataStub(
  watchlist: BehaviorSubject<readonly EquityInstrument[]>,
): MarketDataPort {
  return {
    watchlist: () => {
      return watchlist;
    },
    quotes: (): Subject<EquityQuote> => {
      return new Subject<EquityQuote>();
    },
    candles: () => {
      return new Subject();
    },
    candleHistory: () => {
      return new Subject();
    },
    depth: () => {
      return new Subject();
    },
  };
}
