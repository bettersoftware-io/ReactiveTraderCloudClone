import type { CurrencyPair, Price } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Per-pair live prices; a repeat call for a pair returns the same stream. */
export interface PriceStreamPresenter {
  price$(pair: CurrencyPair): Stream<Price>;
}
