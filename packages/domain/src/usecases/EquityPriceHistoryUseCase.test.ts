import { firstValueFrom, from, NEVER, type Observable } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { EQUITY_PRICE_HISTORY_SIZE, type EquityQuote } from "../equities/quote.js";
import type { MarketDataPort } from "../ports/marketDataPort.js";
import { EquityPriceHistoryUseCase } from "./EquityPriceHistoryUseCase.js";

describe("EquityPriceHistoryUseCase", () => {
  it("yields a growing window for the first quotes", async () => {
    const quotes = [createQuote(1), createQuote(2), createQuote(3)];
    const useCase = new EquityPriceHistoryUseCase(createStubMarketData(quotes));

    const windows = await firstValueFrom(
      useCase.execute("AAPL").pipe(toArray()),
    );

    expect(windows.map(lasts)).toEqual([[1], [1, 2], [1, 2, 3]]);
  });

  it("caps the window at EQUITY_PRICE_HISTORY_SIZE, dropping the oldest quote", async () => {
    const quotes = Array.from(
      { length: EQUITY_PRICE_HISTORY_SIZE + 3 },
      (_, i) => {
        return createQuote(i + 1);
      },
    );
    const useCase = new EquityPriceHistoryUseCase(createStubMarketData(quotes));

    const windows = await firstValueFrom(
      useCase.execute("AAPL").pipe(toArray()),
    );
    const last = windows.at(-1) ?? [];

    expect(last).toHaveLength(EQUITY_PRICE_HISTORY_SIZE);
    expect(lasts(last)[0]).toBe(4);
    expect(lasts(last).at(-1)).toBe(EQUITY_PRICE_HISTORY_SIZE + 3);
  });

  it("appends to a caller-owned window across executions", async () => {
    const window: EquityQuote[] = [];
    const first = new EquityPriceHistoryUseCase(
      createStubMarketData([createQuote(1), createQuote(2)]),
    );
    const second = new EquityPriceHistoryUseCase(
      createStubMarketData([createQuote(3)]),
    );

    await firstValueFrom(first.execute("AAPL", window).pipe(toArray()));
    const windows = await firstValueFrom(
      second.execute("AAPL", window).pipe(toArray()),
    );

    expect(windows.map(lasts)).toEqual([[1, 2, 3]]);
    expect(lasts(window)).toEqual([1, 2, 3]);
  });

  it("gives each execution its own window when none is supplied", async () => {
    const useCase = new EquityPriceHistoryUseCase(
      createStubMarketData([createQuote(1)]),
    );

    await firstValueFrom(useCase.execute("AAPL").pipe(toArray()));
    const windows = await firstValueFrom(
      useCase.execute("AAPL").pipe(toArray()),
    );

    expect(windows.map(lasts)).toEqual([[1]]);
  });
});

function lasts(window: readonly EquityQuote[]): number[] {
  return window.map((quote) => {
    return quote.last;
  });
}

function createQuote(last: number): EquityQuote {
  return {
    symbol: "AAPL",
    bid: last - 0.01,
    ask: last + 0.01,
    last,
    changePct: 0,
    timestamp: last,
  };
}

function createStubMarketData(quotes: readonly EquityQuote[]): MarketDataPort {
  const never = (): Observable<never> => {
    return NEVER;
  };

  return {
    watchlist: never,
    quotes: () => {
      return from(quotes);
    },
    candles: never,
    candleHistory: never,
    depth: never,
  };
}
