import type { Direction } from "../fx/trade.js";

export enum RfqState {
  Open = "Open",
  Expired = "Expired",
  Cancelled = "Cancelled",
  Closed = "Closed",
}

export interface Rfq {
  readonly id: number;
  readonly instrumentId: number;
  readonly quantity: number;
  readonly direction: Direction;
  readonly state: RfqState;
  readonly expirySecs: number;
  readonly creationTimestamp: number;
}

export const CREDIT_QUANTITY_MULTIPLIER = 1_000;
export const CREDIT_MAX_QUANTITY_INPUT = 100_000_000;
