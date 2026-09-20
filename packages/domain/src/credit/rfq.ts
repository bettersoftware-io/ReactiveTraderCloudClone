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

/** Server-driven RFQ lifetime. Mirrors rtc-original CREDIT_RFQ_EXPIRY_SECONDS = 120. */
export const CREDIT_RFQ_EXPIRY_SECONDS = 120;

/** Delay between confirming a freshly-created RFQ and redirecting the user
 * back to the RFQ list (the `rfqSubmission` machine). A UI cadence, kept
 * here because three application cores and the contract tier read it. */
export const RFQ_REDIRECT_DELAY_MS = 1_500;

/**
 * Caps a UI-scale credit quantity at CREDIT_MAX_QUANTITY_INPUT. Mirrors
 * rtc-original applyMaximum (utils/formatNumber.ts:234-235) — exceeding the
 * maximum CLAMPS the value; it does not block submission.
 */
export function applyMaximum(value: number): number {
  return Math.min(value, CREDIT_MAX_QUANTITY_INPUT);
}
