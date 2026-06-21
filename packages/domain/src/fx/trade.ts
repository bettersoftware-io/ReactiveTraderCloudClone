export enum Direction {
  Buy = "Buy",
  Sell = "Sell",
}

export enum TradeStatus {
  Pending = "Pending",
  Done = "Done",
  Rejected = "Rejected",
}

export enum ExecutionStatus {
  Done = "Done",
  Rejected = "Rejected",
  Timeout = "Timeout",
  CreditExceeded = "CreditExceeded",
}

export interface ExecutionRequest {
  readonly currencyPair: string;
  readonly spotRate: number;
  readonly direction: Direction;
  readonly notional: number;
  readonly dealtCurrency: string;
}

export interface Trade {
  readonly tradeId: number;
  readonly tradeName: string;
  readonly currencyPair: string;
  readonly notional: number;
  readonly dealtCurrency: string;
  readonly direction: Direction;
  readonly spotRate: number;
  readonly status: TradeStatus;
  readonly tradeDate: string;
  readonly valueDate: string;
}

/**
 * Buy = base currency (first 3 chars), Sell = terms currency (last 3 chars).
 */
export function deriveDealtCurrency(
  symbol: string,
  direction: Direction,
): string {
  return direction === Direction.Buy ? symbol.slice(0, 3) : symbol.slice(3, 6);
}

export const EXECUTION_TIMEOUT_MS = 30_000;
export const TOO_LONG_THRESHOLD_MS = 2_000;
export const CONFIRMATION_DISMISS_MS = 5_000;

/** How long a received RFQ quote stays live before it auto-expires. */
export const RFQ_TIMEOUT_MS = 10_000;
/** How long the "Quote expired" rejected state is shown before resetting. */
export const REJECTED_DISPLAY_MS = 2_000;
