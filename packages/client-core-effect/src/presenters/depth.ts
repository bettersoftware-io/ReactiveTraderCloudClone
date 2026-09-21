import type { Stream as CoreStream, DepthPresenter } from "@rtc/core-api";
import type { DepthBook, MarketDataPort } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { followPort } from "#/presenters/mirrorPort";

/** Per-symbol depth books: the same memoised, refCounted `followPort` shape
 * as `watchlist.quote$` — one port call per symbol, released on that
 * symbol's last unsubscribe. */
export function createDepthPresenter(
  host: EffectHost,
  marketData: MarketDataPort,
): DepthPresenter {
  const books = new Map<string, CoreStream<DepthBook>>();

  return {
    depth$: (symbol: string) => {
      const cached = books.get(symbol);

      if (cached !== undefined) {
        return cached;
      }

      const stream = followPort(host, marketData.depth(symbol));
      books.set(symbol, stream);
      return stream;
    },
  };
}
