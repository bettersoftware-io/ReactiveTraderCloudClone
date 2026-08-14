import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Candle } from "#/equities/candle.js";
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

    it.each(CANDLE_TIMEFRAMES)(
      "candles(symbol, %s) emits an OHLC array with high >= low for each bar",
      async (timeframe) => {
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
      },
    );

    // M5: this contract deliberately does NOT assert the page-continuity law
    // (a page's newest candle chains seamlessly into the series it was
    // requested against, and page N+1 chains into page N — see the design
    // spec's §2 Continuity law). Asserting it HERE would need every
    // `MarketDataDriver` implementation (the simulator's synchronous ack, the
    // ws-real fake's scripted RPC responses) to serve REAL chaining price
    // data, not just chaining TIMES — the wsRealMarketData contract's driver
    // already fabricates a schematic page per `beforeTime` with no shared
    // price walk behind it, so continuity there would be vacuous rather than
    // load-bearing. The property only has real teeth at the tier that
    // actually GENERATES the walk: `EquityMarketDataSimulator`, which is
    // exactly where `EquityMarketDataSimulator.candleHistory.test.ts`
    // ("chains page-to-page and page-to-base: closes are continuous across
    // every seam") attests it. Determinism and the exhaustion/depth-cap laws
    // stay here because every driver can express THOSE honestly.
    it("candleHistory returns a page strictly before beforeTime, chronological, at most count", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        const seriesPromise = firstValueFrom(port.candles("AAPL"));
        await driver.ackCandles("AAPL");
        const series = await seriesPromise;
        const oldest = series[0] as Candle;

        const pagePromise = firstValueFrom(
          port.candleHistory("AAPL", "1D", oldest.time, 5),
        );
        await driver.ackCandles("AAPL");
        const page = await pagePromise;

        expect(page.length).toBeLessThanOrEqual(5);

        for (const c of page) {
          expect(c.time).toBeLessThan(oldest.time);
        }

        for (let i = 1; i < page.length; i++) {
          expect((page[i] as Candle).time).toBeGreaterThan(
            (page[i - 1] as Candle).time,
          );
        }
      } finally {
        teardown();
      }
    });

    it("candleHistory is deterministic: identical arguments yield identical candles", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        const seriesPromise = firstValueFrom(port.candles("AAPL"));
        await driver.ackCandles("AAPL");
        const series = await seriesPromise;
        const beforeTime = (series[0] as Candle).time;

        const p1Promise = firstValueFrom(
          port.candleHistory("AAPL", "1D", beforeTime, 5),
        );
        await driver.ackCandles("AAPL");
        const p1 = await p1Promise;

        const p2Promise = firstValueFrom(
          port.candleHistory("AAPL", "1D", beforeTime, 5),
        );
        await driver.ackCandles("AAPL");
        const p2 = await p2Promise;

        expect(p2).toEqual(p1);
      } finally {
        teardown();
      }
    });

    it("candleHistory returns an empty page once history is exhausted", async () => {
      const { port, driver, teardown } = makeHarness();

      try {
        const pagePromise = firstValueFrom(
          port.candleHistory("AAPL", "1D", Number.NEGATIVE_INFINITY, 5),
        );
        await driver.ackCandles("AAPL");
        const page = await pagePromise;

        expect(page).toEqual([]);
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
