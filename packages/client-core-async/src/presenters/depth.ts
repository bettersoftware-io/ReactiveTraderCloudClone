import type { DepthPresenter } from "@rtc/core-api";
import type { MarketDataPort } from "@rtc/domain";

import { createKeyedPortStreams } from "#/presenters/keyedPortStreams";

/** Per-symbol depth books — the same memoised, refCounted shape as
 * `WatchlistPresenter.quote$`. */
export function createDepthPresenter(
  marketData: MarketDataPort,
): DepthPresenter {
  return {
    depth$: createKeyedPortStreams((symbol: string) => {
      return marketData.depth(symbol);
    }),
  };
}
