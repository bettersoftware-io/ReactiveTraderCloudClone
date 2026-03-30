import type { Direction } from "../fx/trade.js";
import type { Rfq } from "../credit/rfq.js";
import type { Quote } from "../credit/quote.js";

export type RfqEvent =
  | { readonly type: "startOfStateOfTheWorld" }
  | { readonly type: "endOfStateOfTheWorld" }
  | { readonly type: "rfqCreated"; readonly payload: Rfq }
  | { readonly type: "quoteCreated"; readonly payload: Quote }
  | { readonly type: "quoteQuoted"; readonly payload: Quote }
  | { readonly type: "quotePassed"; readonly payload: Quote }
  | { readonly type: "quoteAccepted"; readonly payload: Quote }
  | { readonly type: "rfqClosed"; readonly payload: Rfq };

export interface CreateRfqRequest {
  readonly instrumentId: number;
  readonly dealerIds: readonly number[];
  readonly quantity: number;
  readonly direction: Direction;
  readonly expirySecs: number;
}

export interface QuoteRequest {
  readonly quoteId: number;
  readonly price: number;
}

export interface WorkflowPort {
  subscribe(): AsyncIterable<RfqEvent>;
  createRfq(request: CreateRfqRequest): Promise<number>;
  cancelRfq(rfqId: number): Promise<void>;
  quote(request: QuoteRequest): Promise<void>;
  pass(quoteId: number): Promise<void>;
  accept(quoteId: number): Promise<void>;
}
