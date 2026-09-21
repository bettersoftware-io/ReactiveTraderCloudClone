import type { WatchlistPresenter } from "@rtc/core-api";
import type { MarketDataPort } from "@rtc/domain";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { createKeyedPortStreams } from "#/presenters/keyedPortStreams";

/** The roster is the retained singleton (`marketData.watchlist()` called
 * ONCE, here, held until `lifetime` aborts); quotes are per-symbol. */
export function createWatchlistPresenter(
  marketData: MarketDataPort,
  lifetime: AbortSignal,
): WatchlistPresenter {
  const roster = topicFromObservable(marketData.watchlist(), lifetime);

  return {
    watchlist$: topicToStream(roster),
    quote$: createKeyedPortStreams((symbol: string) => {
      return marketData.quotes(symbol);
    }),
  };
}
