import type { PriceTick } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Per-symbol rolling price-tick windows backing the tile sparklines. A
 * remounted symbol re-reads its accumulated window rather than restarting
 * from an empty buffer. */
export interface PriceHistoryPresenter {
  history$(symbol: string): Stream<readonly PriceTick[]>;
}
