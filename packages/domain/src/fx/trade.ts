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
 * Dealt currency is always the pair's base currency (first 3 chars),
 * regardless of Buy/Sell direction — the tile notional input is always
 * denominated in the base currency, and the seeded blotter rows confirm the
 * same convention (Sell EURJPY => DEAL EUR, Sell USDJPY => DEAL USD). This
 * matches the upstream ReactiveTraderCloud default. `_direction` is kept in
 * the signature for call-site stability / future dealt-currency toggling.
 */
export function deriveDealtCurrency(
  symbol: string,
  _direction: Direction,
): string {
  return symbol.slice(0, 3);
}

const DAY_MS = 86_400_000;

/** FX spot settlement convention used by this app's simulators: T+2. */
export const SPOT_VALUE_DATE_OFFSET_DAYS = 2;

/**
 * Returns the ISO (YYYY-MM-DD) date `offsetDays` away from `baseMs`
 * (default: now). Shared by TradeStoreSimulator (seed trades) and
 * ExecutionSimulator (live-executed trades) so both apply the same T+2
 * value-date convention from a single captured instant.
 */
export function isoDaysFromNow(
  offsetDays: number,
  baseMs: number = Date.now(),
): string {
  return new Date(baseMs + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

export const EXECUTION_TIMEOUT_MS = 30_000;
export const TOO_LONG_THRESHOLD_MS = 2_000;
export const CONFIRMATION_DISMISS_MS = 5_000;

/** How long a received RFQ quote stays live before it auto-expires. */
export const RFQ_TIMEOUT_MS = 10_000;
/** How long the "Quote expired" rejected state is shown before resetting. */
export const REJECTED_DISPLAY_MS = 2_000;
