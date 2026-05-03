import type { Direction } from "@rtc/domain";

export interface RfqBodyDto {
  readonly id: number;
  readonly instrumentId: number;
  readonly quantity: number;
  readonly direction: Direction;
  readonly state: string;
  readonly expirySecs: number;
  readonly creationTimestamp: number;
}

export interface QuoteBodyDto {
  readonly id: number;
  readonly rfqId: number;
  readonly dealerId: number;
  readonly state: QuoteStateDto;
}

export type QuoteStateDto =
  | { readonly type: "pendingWithoutPrice" }
  | { readonly type: "pendingWithPrice"; readonly price: number }
  | { readonly type: "passed" }
  | { readonly type: "accepted"; readonly price: number }
  | { readonly type: "rejectedWithPrice"; readonly price: number }
  | { readonly type: "rejectedWithoutPrice" };

export type WorkflowEvent =
  | { readonly type: "startOfStateOfTheWorld" }
  | { readonly type: "endOfStateOfTheWorld" }
  | { readonly type: "rfqCreated"; readonly payload: RfqBodyDto }
  | { readonly type: "quoteCreated"; readonly payload: QuoteBodyDto }
  | { readonly type: "quoteQuoted"; readonly payload: QuoteBodyDto }
  | { readonly type: "quotePassed"; readonly payload: QuoteBodyDto }
  | { readonly type: "quoteAccepted"; readonly payload: QuoteBodyDto }
  | { readonly type: "rfqClosed"; readonly payload: RfqBodyDto };

export interface CreateRfqRequestDto {
  readonly instrumentId: number;
  readonly dealerIds: readonly number[];
  readonly quantity: number;
  readonly direction: Direction;
  readonly expirySecs: number;
}

export interface QuoteRequestDto {
  readonly quoteId: number;
  readonly price: number;
}

export interface PassRequestDto {
  readonly quoteId: number;
}

export interface AcceptRequestDto {
  readonly quoteId: number;
}

export interface CancelRfqRequestDto {
  readonly rfqId: number;
}
