import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { CANDLE_TIMEFRAMES } from "#/equities/timeframe.js";

import type { MarketDataPort } from "../marketDataPort.js";

export interface MarketDataDriver {
  ackWatchlist(): Promise<void>;
  tickQuote(symbol: string): Promise<void>;
  ackCandles(symbol: string): Promise<void>;
  ackDepth(symbol: string): Promise<void>;
}
export interface MarketDataHarness {
  port: MarketDataPort;
  driver: MarketDataDriver;
  teardown: () => void;
}

export function describeMarketDataPortContract(
  label: string,
  makeHarness: () => MarketDataHarness,
): void {
  describe(`${label} :: MarketDataPort contract`, () => {
    it("watchlist emits a non-empty array of instruments", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        const promise = firstValueFrom(port.watchlist());
        await driver.ackWatchlist();
        const list = await promise;
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBeGreaterThan(0);
        expect(typeof list[0]?.symbol).toBe("string");
      } finally {
        teardown();
      }
    });

    it("quotes emits a tick with bid <= last <= ask for the requested symbol", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        const promise = firstValueFrom(port.quotes("AAPL"));
        await driver.tickQuote("AAPL");
        const q = await promise;
        expect(q.symbol).toBe("AAPL");
        expect(q.bid).toBeLessThanOrEqual(q.last);
        expect(q.last).toBeLessThanOrEqual(q.ask);
      } finally {
        teardown();
      }
    });

    it("candles emits an OHLC array with high >= low for each bar", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        const promise = firstValueFrom(port.candles("AAPL"));
        await driver.ackCandles("AAPL");
        const candles = await promise;
        expect(candles.length).toBeGreaterThan(0);

        for (const c of candles) {
          expect(c.high).toBeGreaterThanOrEqual(c.low);
        }
      } finally {
        teardown();
      }
    });

    it.each(
      CANDLE_TIMEFRAMES,
    )("candles(symbol, %s) emits an OHLC array with high >= low for each bar", async (timeframe) => {
      const { port, driver, teardown } = makeHarness();

      try {
        const promise = firstValueFrom(port.candles("AAPL", timeframe));
        await driver.ackCandles("AAPL");
        const candles = await promise;
        expect(candles.length).toBeGreaterThan(0);

        for (const c of candles) {
          expect(c.high).toBeGreaterThanOrEqual(c.low);
        }
      } finally {
        teardown();
      }
    });

    it("depth emits a book whose best bid < best ask", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        const promise = firstValueFrom(port.depth("AAPL"));
        await driver.ackDepth("AAPL");
        const book = await promise;
        expect(book.symbol).toBe("AAPL");
        expect(book.bids[0]?.price).toBeLessThan(
          book.asks[0]?.price ?? Number.POSITIVE_INFINITY,
        );
      } finally {
        teardown();
      }
    });
  });
}
