// Framework-neutral snapshot of everything the UI reads through AppHooks.
// No React/Solid imports — this file (and the rest of visual/shared) is the
// portable core shared by every UI implementation.
import {
  ConnectionStatus,
  type CurrencyPair, type Price, type PriceTick, type Trade,
  type Rfq, type Quote, type PositionUpdates,
  type Instrument, type Dealer,
} from "@rtc/domain";

export interface AppData {
  prices: Record<string, Price | null>;
  priceHistory: Record<string, readonly PriceTick[]>;
  trades: readonly Trade[];
  analytics: PositionUpdates | null;
  rfqs: readonly Rfq[];
  quotesForRfq: Record<number, readonly Quote[]>;
  allQuotes: ReadonlyMap<number, Quote>;
  currencyPairs: readonly CurrencyPair[];
  instruments: readonly Instrument[];
  dealers: readonly Dealer[];
  connectionStatus: ConnectionStatus;
}

/** A fully-populated empty baseline; fixtures override only what they exercise. */
export const defaultAppData: AppData = {
  prices: {},
  priceHistory: {},
  trades: [],
  analytics: null,
  rfqs: [],
  quotesForRfq: {},
  allQuotes: new Map(),
  currencyPairs: [],
  instruments: [],
  dealers: [],
  connectionStatus: ConnectionStatus.CONNECTED,
};

/** Shallow-merge a partial fixture over the baseline. */
export function makeAppData(overrides: Partial<AppData>): AppData {
  return { ...defaultAppData, ...overrides };
}
