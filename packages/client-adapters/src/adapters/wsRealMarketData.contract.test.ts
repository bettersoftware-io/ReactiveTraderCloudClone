import { AuthSimulator, type PreferencesPort } from "@rtc/domain";
import { describeMarketDataPortContract } from "@rtc/domain/ports/__contracts__/MarketDataPortContract";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";

import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { InMemorySessionStore } from "./InMemorySessionStore";
import { createWsRealPorts } from "./portFactory";

interface CandleHistoryRequestPayload {
  readonly beforeTime: number;
}

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
      // The contract laws reuse this one driver hook for BOTH candles() and
      // candleHistory() calls, so it must ack whichever RPC is actually
      // pending. A candleHistory ack is derived from the requested
      // `beforeTime`: non-finite (the exhaustion law's -Infinity) means
      // "start of history" -> [], otherwise a short chronological page
      // strictly before it.
      ackCandles: async () => {
        const pendingType = await awaitEitherPendingRpc(ws, [
          CLIENT_MSG.GET_CANDLES,
          CLIENT_MSG.GET_CANDLE_HISTORY,
        ]);

        if (pendingType === CLIENT_MSG.GET_CANDLE_HISTORY) {
          const { beforeTime } = lastSentPayload<CandleHistoryRequestPayload>(
            ws,
            CLIENT_MSG.GET_CANDLE_HISTORY,
          );

          const page = Number.isFinite(beforeTime)
            ? [beforeTime - 3, beforeTime - 2, beforeTime - 1].map((time) => {
                return {
                  time,
                  open: 1,
                  high: 2,
                  low: 0.5,
                  close: 1.5,
                  volume: 1_200_000,
                };
              })
            : [];

          ws.nextRpcResponse(CLIENT_MSG.GET_CANDLE_HISTORY, {
            type: "ack",
            payload: page,
          });
          return;
        }

        ws.nextRpcResponse(CLIENT_MSG.GET_CANDLES, {
          type: "ack",
          payload: [
            {
              time: 0,
              open: 1,
              high: 2,
              low: 0.5,
              close: 1.5,
              volume: 1_200_000,
            },
          ],
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

/**
 * Yield to microtasks until one of `names` has a pending RPC, returning
 * whichever fired first. Mirrors `awaitPendingRpc` but resolves across a
 * candles()/candleHistory() fork instead of a single fixed RPC name.
 */
async function awaitEitherPendingRpc(
  ws: FakeWsAdapter,
  names: readonly string[],
  maxIterations = 1000,
): Promise<string> {
  for (let i = 0; i < maxIterations; i++) {
    const found = names.find((name) => {
      return ws.hasPendingRpc(name);
    });

    if (found) {
      return found;
    }

    await Promise.resolve();
  }

  throw new Error(
    `Expected one of pending RPCs [${names.join(", ")}] but none registered after ${maxIterations} microtask yields`,
  );
}

/** The payload of the most recent sent/rpc'd message of `type`. */
function lastSentPayload<T>(ws: FakeWsAdapter, type: string): T {
  const messages = ws.sentMessages().filter((m) => {
    return m.type === type;
  });
  const last = messages[messages.length - 1];

  if (!last) {
    throw new Error(`No sent message of type "${type}"`);
  }

  return last.payload as T;
}
