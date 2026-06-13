import { BehaviorSubject } from "rxjs";
import {
  ConnectionStatus,
  type Trade,
  type Instrument,
  type Dealer,
  type Rfq,
  type Quote,
  type CurrencyPair,
  type Price,
  type PriceTick,
  type PositionUpdates,
  type CreateRfqInput,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  type RfqQuoteResult,
} from "@rtc/domain";

/** The value each NULLARY query hook yields. Parametric hooks (usePrice etc.)
 *  are modelled by the per-key subject maps below, not by this map. */
export interface HookValues {
  useConnectionStatus: ConnectionStatus;
  useTrades: readonly Trade[];
  useAnalytics: PositionUpdates | null;
  useRfqs: readonly Rfq[];
  useAllQuotes: ReadonlyMap<number, Quote>;
  useCurrencyPairs: readonly CurrencyPair[];
  useInstruments: readonly Instrument[];
  useDealers: readonly Dealer[];
}

const DEFAULTS: HookValues = {
  useConnectionStatus: ConnectionStatus.CONNECTED,
  useTrades: [],
  useAnalytics: null,
  useRfqs: [],
  useAllQuotes: new Map(),
  useCurrencyPairs: [],
  useInstruments: [],
  useDealers: [],
};

/**
 * Seed values for the PARAMETRIC query hooks. Each is keyed by the same
 * parameter the real hook takes:
 *   - usePrice(pair)            → keyed by pair.symbol
 *   - usePriceHistory(symbol)   → keyed by symbol
 * The adapter lazily creates a BehaviorSubject per key, so a tile that reads
 * usePrice("EURUSD") subscribes to its own subject and re-renders only when
 * that key is pushed — mirroring @react-rxjs `bind`'s per-argument streams.
 */
export interface ParametricSeed {
  prices?: Readonly<Record<string, Price | null>>;
  histories?: Readonly<Record<string, readonly PriceTick[]>>;
}

/**
 * Canned results emitted by command hooks. When a `*Throws` flag is set the
 * corresponding command's Observable errors instead of emitting, exercising the
 * catch path in the consuming hook (useExecuteTrade / useRfqQuote).
 */
export interface CommandResults {
  createRfq?: number;
  executeTrade?: ExecuteTradeResult;
  executeTradeThrows?: boolean;
  requestRfqQuote?: RfqQuoteResult;
  requestRfqQuoteThrows?: boolean;
}

/** Inputs captured from command hooks during a test. */
export interface CommandLog {
  createRfq: CreateRfqInput[];
  executeTrade: ExecuteTradeInput[];
  requestRfqQuote: { symbol: string; pipsPosition: number }[];
}

export interface World {
  readonly sources: { [K in keyof HookValues]: BehaviorSubject<HookValues[K]> };
  /** Per-key subject for usePrice(pair), keyed by pair.symbol. */
  priceFor(symbol: string): BehaviorSubject<Price | null>;
  /** Per-key subject for usePriceHistory(symbol). */
  historyFor(symbol: string): BehaviorSubject<readonly PriceTick[]>;
  /** Push a new price for one symbol (drives that tile's re-render). */
  setPrice(symbol: string, value: Price | null): void;
  /** Push a new price history for one symbol. */
  setHistory(symbol: string, value: readonly PriceTick[]): void;
  readonly results: CommandResults;
  readonly commands: CommandLog;
  /** Push new values for one or more NULLARY hooks (drives re-renders). */
  push(patch: Partial<HookValues>): void;
}

export function createWorld(
  initial: Partial<HookValues> = {},
  results: CommandResults = {},
  parametric: ParametricSeed = {},
): World {
  const merged: HookValues = { ...DEFAULTS, ...initial };
  const sources = {} as { [K in keyof HookValues]: BehaviorSubject<HookValues[K]> };
  for (const key of Object.keys(merged) as (keyof HookValues)[]) {
    // Each subject is typed by its own key; the cast bridges the per-key union.
    (sources[key] as BehaviorSubject<unknown>) = new BehaviorSubject<unknown>(merged[key]);
  }

  const prices = new Map<string, BehaviorSubject<Price | null>>();
  const histories = new Map<string, BehaviorSubject<readonly PriceTick[]>>();

  const priceFor = (symbol: string): BehaviorSubject<Price | null> => {
    let subject = prices.get(symbol);
    if (!subject) {
      subject = new BehaviorSubject<Price | null>(null);
      prices.set(symbol, subject);
    }
    return subject;
  };
  const historyFor = (symbol: string): BehaviorSubject<readonly PriceTick[]> => {
    let subject = histories.get(symbol);
    if (!subject) {
      subject = new BehaviorSubject<readonly PriceTick[]>([]);
      histories.set(symbol, subject);
    }
    return subject;
  };

  for (const [symbol, value] of Object.entries(parametric.prices ?? {})) {
    priceFor(symbol).next(value);
  }
  for (const [symbol, value] of Object.entries(parametric.histories ?? {})) {
    historyFor(symbol).next(value);
  }

  return {
    sources,
    priceFor,
    historyFor,
    setPrice: (symbol, value) => priceFor(symbol).next(value),
    setHistory: (symbol, value) => historyFor(symbol).next(value),
    results,
    commands: { createRfq: [], executeTrade: [], requestRfqQuote: [] },
    push(patch) {
      for (const key of Object.keys(patch) as (keyof HookValues)[]) {
        (sources[key] as BehaviorSubject<unknown>).next(patch[key]);
      }
    },
  };
}
