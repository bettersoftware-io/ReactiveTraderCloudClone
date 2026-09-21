import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { DepthBook, MarketDataPort } from "@rtc/domain";

import { createDepthPresenter } from "#/presenters/depth";

describe("createDepthPresenter", () => {
  it("depth$(symbol) is memoised per symbol, delegates to marketData.depth, and releases the port on the last unsubscribe", () => {
    const books = new Map<string, Subject<DepthBook>>();
    const marketData: MarketDataPort = {
      watchlist: () => {
        return new Subject();
      },
      quotes: () => {
        return new Subject();
      },
      candles: () => {
        return new Subject();
      },
      candleHistory: () => {
        return new Subject();
      },
      depth: (symbol: string) => {
        const source = new Subject<DepthBook>();
        books.set(symbol, source);
        return source;
      },
    };
    const presenter = createDepthPresenter(marketData);

    expect(presenter.depth$("AAPL")).toBe(presenter.depth$("AAPL"));
    expect(presenter.depth$("AAPL")).not.toBe(presenter.depth$("MSFT"));

    const sub = presenter.depth$("AAPL").subscribe(() => {});
    expect(books.get("AAPL")?.observed).toBe(true);
    sub.unsubscribe();
    expect(books.get("AAPL")?.observed).toBe(false);
  });
});
