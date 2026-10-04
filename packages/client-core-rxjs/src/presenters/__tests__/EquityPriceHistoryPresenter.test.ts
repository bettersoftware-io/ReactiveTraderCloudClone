import { NEVER, of, Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EquityQuote, MarketDataPort } from "@rtc/domain";

import { EquityPriceHistoryPresenter } from "../EquityPriceHistoryPresenter";

describe("EquityPriceHistoryPresenter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("repaints the retained window on remount before the next quote", () => {
    const quotes = new Subject<EquityQuote>();
    const presenter = new EquityPriceHistoryPresenter(
      createMarketData(quotes),
      of(false),
    );

    const seen: number[][] = [];
    const first = presenter.history$("MSFT").subscribe((w) => {
      seen.push(w.map(lastOf));
    });
    quotes.next(createQuote(1));
    quotes.next(createQuote(2));
    first.unsubscribe();

    const replay: number[][] = [];
    const again = presenter.history$("MSFT").subscribe((w) => {
      replay.push(w.map(lastOf));
    });

    expect(seen).toEqual([[1], [1, 2]]);
    expect(replay).toEqual([[1, 2]]);
    again.unsubscribe();
  });

  it("releases the quote subscription on the last unsubscribe", async () => {
    vi.useFakeTimers();
    const quotes = new Subject<EquityQuote>();
    const presenter = new EquityPriceHistoryPresenter(
      createMarketData(quotes),
      of(false),
    );

    const sub = presenter.history$("MSFT").subscribe();
    expect(quotes.observed).toBe(true);
    sub.unsubscribe();
    // conflateWhen defers its reset by timer(0) so a flag flip can cancel it.
    await vi.advanceTimersByTimeAsync(0);
    expect(quotes.observed).toBe(false);
  });
});

function lastOf(quote: EquityQuote): number {
  return quote.last;
}

function createQuote(last: number): EquityQuote {
  return {
    symbol: "MSFT",
    bid: last,
    ask: last,
    last,
    changePct: 0,
    timestamp: last,
  };
}

function createMarketData(quotes: Subject<EquityQuote>): MarketDataPort {
  return {
    watchlist: () => {
      return NEVER;
    },
    quotes: () => {
      return quotes;
    },
    candles: () => {
      return NEVER;
    },
    candleHistory: () => {
      return NEVER;
    },
    depth: () => {
      return NEVER;
    },
  };
}
