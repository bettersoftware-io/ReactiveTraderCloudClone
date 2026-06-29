import { of } from "rxjs";
import { describe } from "vitest";

import type { MarketDataPort } from "../marketDataPort.js";
import { describeMarketDataPortContract } from "./MarketDataPortContract.js";

describe("describeMarketDataPortContract :: smoke", () => {
  describeMarketDataPortContract("inline fake", () => {
    const port: MarketDataPort = {
      watchlist: () => {
        return of([
          { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
        ] as const);
      },
      quotes: (symbol: string) => {
        return of({
          symbol,
          bid: 1,
          ask: 2,
          last: 1.5,
          changePct: 0,
          timestamp: 0,
        });
      },
      candles: () => {
        return of([
          { time: 0, open: 1, high: 2, low: 0.5, close: 1.5 },
        ] as const);
      },
      depth: (symbol: string) => {
        return of({
          symbol,
          bids: [{ price: 1, size: 10 }],
          asks: [{ price: 2, size: 10 }],
        });
      },
    };
    return {
      port,
      driver: {
        ackWatchlist: async () => {},
        tickQuote: async () => {},
        ackCandles: async () => {},
        ackDepth: async () => {},
      },
      teardown: () => {},
    };
  });
});
