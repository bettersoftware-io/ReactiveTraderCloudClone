import { BehaviorSubject, NEVER, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EquityQuote, MarketDataPort } from "@rtc/domain";

import { createEquityPriceHistoryPresenter } from "#/presenters/equityPriceHistory";

describe("createEquityPriceHistoryPresenter (async)", () => {
  it("hands a resubscriber the retained window synchronously and keeps accumulating into the same window", () => {
    const { port, quotes } = createPort();
    const presenter = createEquityPriceHistoryPresenter(
      port,
      new BehaviorSubject<boolean>(false),
    );
    const stream = presenter.history$("MSFT");
    expect(presenter.history$("MSFT")).toBe(stream);
    const first = stream.subscribe(() => {});
    quotes.next(createQuote(1));
    quotes.next(createQuote(2));
    first.unsubscribe();

    const windows: (readonly EquityQuote[])[] = [];
    const again = stream.subscribe((window) => {
      windows.push(window);
    });
    expect(lasts(windows[0] ?? [])).toEqual([1, 2]);
    quotes.next(createQuote(3));
    expect(lasts(windows.at(-1) ?? [])).toEqual([1, 2, 3]);
    again.unsubscribe();
  });

  it("a never-mounted symbol has no lead: nothing arrives synchronously", () => {
    const { port } = createPort();
    const presenter = createEquityPriceHistoryPresenter(
      port,
      new BehaviorSubject<boolean>(false),
    );
    const windows: (readonly EquityQuote[])[] = [];
    const sub = presenter.history$("AAPL").subscribe((window) => {
      windows.push(window);
    });
    expect(windows).toEqual([]);
    sub.unsubscribe();
  });

  interface PortFixture {
    port: MarketDataPort;
    quotes: Subject<EquityQuote>;
  }

  function lasts(window: readonly EquityQuote[]): number[] {
    return window.map((quote) => {
      return quote.last;
    });
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

  function createPort(): PortFixture {
    const quotes = new Subject<EquityQuote>();
    const port: MarketDataPort = {
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
    return { port, quotes };
  }
});
