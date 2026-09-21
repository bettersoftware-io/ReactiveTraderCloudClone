import type { Stream as CoreStream, WatchlistPresenter } from "@rtc/core-api";
import type { EquityQuote, MarketDataPort } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { followPort, mirrorPortAsIs } from "#/presenters/mirrorPort";

/** The equities roster and the per-symbol quote streams. The roster is the
 * RETAINED mirror — `marketData.watchlist()` called ONCE, here, the period
 * ended only by the host scope (the RxJS `warmReplay()`); the quotes are
 * per-symbol `followPort`s, memoised per symbol and refCounted, because a
 * per-symbol stream is refcounted on the server and must let go when its
 * symbol is deselected. `followPort` rather than `mirrorPort` for exactly
 * that reason: a seed peek would subscribe/unsubscribe/subscribe the wire at
 * the start of every warm period. */
export function createWatchlistPresenter(
  host: EffectHost,
  marketData: MarketDataPort,
): WatchlistPresenter {
  const roster = marketData.watchlist();
  const quotes = new Map<string, CoreStream<EquityQuote>>();

  return {
    watchlist$: mirrorPortAsIs(host, roster, { retain: true }),
    quote$: (symbol: string) => {
      const cached = quotes.get(symbol);

      if (cached !== undefined) {
        return cached;
      }

      const stream = followPort(host, marketData.quotes(symbol));
      quotes.set(symbol, stream);
      return stream;
    },
  };
}
