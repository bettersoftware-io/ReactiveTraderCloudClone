import { BehaviorSubject } from "rxjs";
import {
  ConnectionStatus,
  type Trade,
  type Instrument,
  type Dealer,
  type Rfq,
  type Quote,
  type CurrencyPair,
  type PositionUpdates,
  type CreateRfqInput,
} from "@rtc/domain";

/** The value each NULLARY query hook yields. Parametric hooks (usePrice etc.)
 *  are returned as static empties by the adapter and are not in this map. */
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

/** Canned results emitted by command hooks. */
export interface CommandResults {
  createRfq?: number;
}

/** Inputs captured from command hooks during a test. */
export interface CommandLog {
  createRfq: CreateRfqInput[];
}

export interface World {
  readonly sources: { [K in keyof HookValues]: BehaviorSubject<HookValues[K]> };
  readonly results: CommandResults;
  readonly commands: CommandLog;
  /** Push new values for one or more hooks (drives re-renders). */
  push(patch: Partial<HookValues>): void;
}

export function createWorld(
  initial: Partial<HookValues> = {},
  results: CommandResults = {},
): World {
  const merged: HookValues = { ...DEFAULTS, ...initial };
  const sources = {} as { [K in keyof HookValues]: BehaviorSubject<HookValues[K]> };
  for (const key of Object.keys(merged) as (keyof HookValues)[]) {
    // Each subject is typed by its own key; the cast bridges the per-key union.
    (sources[key] as BehaviorSubject<unknown>) = new BehaviorSubject<unknown>(merged[key]);
  }
  return {
    sources,
    results,
    commands: { createRfq: [] },
    push(patch) {
      for (const key of Object.keys(patch) as (keyof HookValues)[]) {
        (sources[key] as BehaviorSubject<unknown>).next(patch[key]);
      }
    },
  };
}
