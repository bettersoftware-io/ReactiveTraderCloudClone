import type { Observable } from "rxjs";

import type { Quote } from "../credit/quote.js";
import type { Rfq } from "../credit/rfq.js";
import type { Direction } from "../fx/trade.js";

export type RfqEvent =
  | { readonly type: "startOfStateOfTheWorld" }
  | { readonly type: "endOfStateOfTheWorld" }
  | { readonly type: "rfqCreated"; readonly payload: Rfq }
  | { readonly type: "quoteCreated"; readonly payload: Quote }
  | { readonly type: "quoteQuoted"; readonly payload: Quote }
  | { readonly type: "quotePassed"; readonly payload: Quote }
  | { readonly type: "quoteAccepted"; readonly payload: Quote }
  | { readonly type: "quoteRejected"; readonly payload: Quote }
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
  events(): Observable<RfqEvent>;
  createRfq(request: CreateRfqRequest): Observable<number>;
  cancelRfq(rfqId: number): Observable<void>;
  quote(request: QuoteRequest): Observable<void>;
  pass(quoteId: number): Observable<void>;
  accept(quoteId: number): Observable<void>;
}
