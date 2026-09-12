import type { RfqQuoteResult } from "@rtc/domain";

import type { Stream } from "#/stream";

/** The RFQ quote lifecycle of a single tile, relocated out of the old
 * useRfqState + useRfqQuote React hooks. TileRfq reads this state. */
type RfqStatus = "init" | "requested" | "received" | "rejected";

export interface RfqQuote {
  bid: number;
  ask: number;
  timeoutMs: number;
}

export interface RfqState {
  status: RfqStatus;
  quote: RfqQuote | null;
  remainingMs: number;
}

export interface RfqTileDeps {
  /** The request-quote command (RfqQuotePresenter.requestQuote), injected so
   * timing is controllable in tests. */
  requestQuote: (
    symbol: string,
    pipsPosition: number,
  ) => Stream<RfqQuoteResult>;
}

export interface RfqTileIntents {
  requestQuote: () => void;
  cancel: () => void;
  reject: () => void;
  accept: () => void;
}
