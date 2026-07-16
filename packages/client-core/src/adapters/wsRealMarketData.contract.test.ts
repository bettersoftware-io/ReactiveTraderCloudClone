import { AuthSimulator, type PreferencesPort } from "@rtc/domain";
import { describeMarketDataPortContract } from "@rtc/domain/ports/__contracts__/MarketDataPortContract";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";

import { awaitPendingRpc } from "./__tests__/awaitPendingRpc";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createWsRealPorts } from "./portFactory";

describeMarketDataPortContract("wsRealMarketData", () => {
  const ws = new FakeWsAdapter();
  const ports = createWsRealPorts(ws, {
    preferences: {} as PreferencesPort,
    auth: new AuthSimulator({}),
    sessionStore: new InMemorySessionStore(),
  });
  return {
    port: ports.marketData,
    driver: {
      ackWatchlist: async () => {
        await Promise.resolve();
        ws.emit(SERVER_MSG.WATCHLIST, [
          { symbol: "AAPL", name: "Apple", exchange: "NASDAQ" },
        ]);
      },
      tickQuote: async () => {
        await Promise.resolve();
        ws.emit(SERVER_MSG.EQ_QUOTE, {
          symbol: "AAPL",
          bid: 1,
          ask: 2,
          last: 1.5,
          changePct: 0,
          timestamp: 0,
        });
      },
      ackCandles: async () => {
        await awaitPendingRpc(ws, CLIENT_MSG.GET_CANDLES);
        ws.nextRpcResponse(CLIENT_MSG.GET_CANDLES, {
          type: "ack",
          payload: [{ time: 0, open: 1, high: 2, low: 0.5, close: 1.5 }],
        });
      },
      ackDepth: async () => {
        await Promise.resolve();
        ws.emit(SERVER_MSG.DEPTH, {
          symbol: "AAPL",
          bids: [{ price: 1, size: 10 }],
          asks: [{ price: 2, size: 10 }],
        });
      },
    },
    teardown: () => {
      return ws.dispose();
    },
  };
});
