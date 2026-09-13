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

export interface RfqTileIntents {
  requestQuote: () => void;
  cancel: () => void;
  reject: () => void;
  accept: () => void;
}
