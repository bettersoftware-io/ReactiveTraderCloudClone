import type { RfqQuoteResult } from "@rtc/domain";

import type { Stream } from "#/stream";

/** One-shot FX RFQ quote request for a tile. */
export interface RfqQuotePresenter {
  requestQuote(symbol: string, pipsPosition: number): Stream<RfqQuoteResult>;
}
