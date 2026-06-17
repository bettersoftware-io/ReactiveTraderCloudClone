import { bind } from "@react-rxjs/core";
import { firstValueFrom } from "rxjs";
import {
  ConnectionStatus,
  type CurrencyPair, type Price, type PriceTick, type Trade,
  type Rfq, type Quote, type PositionUpdates,
  type Instrument, type Dealer,
  type ExecuteTradeInput, type ExecuteTradeResult, type CreateRfqInput,
  type RfqQuoteResult, type QuoteRequest,
} from "@rtc/domain";
import type { Presenters } from "../../app/composition";
import type { MachineFactories } from "../../app/presenters/machine";
import { useMachine } from "./useMachine";
import type {
  TileExecutionState,
  TileExecutionIntents,
} from "../../app/presenters/TileExecutionMachine";
import type {
  RfqState,
  RfqTileIntents,
} from "../../app/presenters/RfqTileMachine";
import type {
  NotionalView,
  NotionalIntents,
} from "../../app/presenters/NotionalMachine";
import type { ThroughputView } from "../../app/presenters/ThroughputPresenter";

export interface AppHooks {
  // Streams
  usePrice: (pair: CurrencyPair) => Price | null;
  usePriceHistory: (symbol: string) => readonly PriceTick[];
  useTrades: () => readonly Trade[];
  useAnalytics: () => PositionUpdates | null;
  useRfqs: () => readonly Rfq[];
  useQuotesForRfq: (rfqId: number) => readonly Quote[];
  useAllQuotes: () => ReadonlyMap<number, Quote>;
  useCurrencyPairs: () => readonly CurrencyPair[];
  useInstruments: () => readonly Instrument[];
  useDealers: () => readonly Dealer[];
  useConnectionStatus: () => ConnectionStatus;
  // Commands (one-shot fire-and-await; the bridge does firstValueFrom)
  useExecuteTrade: () => (input: ExecuteTradeInput) => Promise<ExecuteTradeResult>;
  useCreateRfq: () => (input: CreateRfqInput) => Promise<number>;
  useAcceptQuote: () => (quoteId: number) => Promise<void>;
  useCancelRfq: () => (rfqId: number) => Promise<void>;
  usePassQuote: () => (quoteId: number) => Promise<void>;
  useQuoteRfq: () => (request: QuoteRequest) => Promise<void>;
  useRequestRfqQuote: () => (symbol: string, pipsPosition: number) => Promise<RfqQuoteResult>;
  // Machines (app-layer RxJS behind the useMachine bridge)
  useTileExecution: (pair: CurrencyPair) => { state: TileExecutionState } & TileExecutionIntents;
  useRfqTile: (pair: CurrencyPair) => { state: RfqState } & RfqTileIntents;
  // Intent-free derived flags: return just the boolean (no intents to expose).
  useStaleFlag: (pair: CurrencyPair) => boolean;
  useAnalyticsStaleFlag: () => boolean;
  /** Notional input state for a tile — view state plus intents. */
  useNotional: (defaultNotional: number) => { state: NotionalView } & NotionalIntents;
  /** Global throughput control — shared view state plus the setValue intent. */
  useThroughput: () => ThroughputView & { setValue: (value: number) => void };
}

export function createAppHooks(
  presenters: Presenters,
  machines: MachineFactories,
): AppHooks {
  const [usePrice] = bind(
    (pair: CurrencyPair) => presenters.priceStream.price$(pair),
    null,
  );
  const [usePriceHistory] = bind(
    (symbol: string) => presenters.priceHistory.history$(symbol),
    [] as readonly PriceTick[],
  );
  const [useTrades] = bind(presenters.blotter.trades$, [] as readonly Trade[]);
  const [useAnalytics] = bind(presenters.analytics.position$, null as PositionUpdates | null);
  const [useRfqs] = bind(presenters.rfqs.rfqs$, [] as readonly Rfq[]);
  const [useQuotesForRfq] = bind(
    (rfqId: number) => presenters.rfqs.quotesForRfq$(rfqId),
    [] as readonly Quote[],
  );
  const [useAllQuotes] = bind(
    presenters.rfqs.allQuotes$,
    new Map() as ReadonlyMap<number, Quote>,
  );
  const [useCurrencyPairs] = bind(
    presenters.currencyPairs.pairs$,
    [] as readonly CurrencyPair[],
  );
  const [useInstruments] = bind(
    presenters.instruments.list$,
    [] as readonly Instrument[],
  );
  const [useDealers] = bind(presenters.dealers.list$, [] as readonly Dealer[]);
  const [useConnectionStatus] = bind(
    presenters.connection.status$,
    ConnectionStatus.CONNECTING,
  );
  // Global/shared throughput state → a plain bind (not a per-mount machine).
  const [useThroughputState] = bind(presenters.throughput.state$, {
    value: 100,
    loading: true,
    message: null,
  } as ThroughputView);
  const setThroughput = (value: number) => presenters.throughput.setValue(value);

  // Pre-bound command callbacks. Stable references across calls so React
  // memo/effect dep arrays remain stable. The bridge converts each one-shot
  // presenter Observable to a Promise via firstValueFrom — the void commands'
  // presenters emit `undefined` before completing, so firstValueFrom resolves
  // (rather than rejecting with EmptyError) without needing a defaultValue.
  const executeTrade = (input: ExecuteTradeInput) =>
    firstValueFrom(presenters.execution.execute(input));
  const createRfq = (input: CreateRfqInput) =>
    firstValueFrom(presenters.rfqs.createRfq(input));
  const acceptQuote = (quoteId: number) =>
    firstValueFrom(presenters.rfqs.acceptQuote(quoteId));
  const cancelRfq = (rfqId: number) =>
    firstValueFrom(presenters.rfqs.cancelRfq(rfqId));
  const passQuote = (quoteId: number) =>
    firstValueFrom(presenters.rfqs.passQuote(quoteId));
  const quoteRfq = (req: QuoteRequest) =>
    firstValueFrom(presenters.rfqs.quoteRfq(req));
  const requestRfqQuote = (symbol: string, pipsPosition: number) =>
    firstValueFrom(presenters.rfqQuote.requestQuote(symbol, pipsPosition));

  return {
    usePrice,
    usePriceHistory,
    useTrades,
    useAnalytics,
    useRfqs,
    useQuotesForRfq,
    useAllQuotes,
    useCurrencyPairs,
    useInstruments,
    useDealers,
    useConnectionStatus,
    useExecuteTrade: () => executeTrade,
    useCreateRfq: () => createRfq,
    useAcceptQuote: () => acceptQuote,
    useCancelRfq: () => cancelRfq,
    usePassQuote: () => passQuote,
    useQuoteRfq: () => quoteRfq,
    useRequestRfqQuote: () => requestRfqQuote,
    useTileExecution: (pair: CurrencyPair) =>
      useMachine(() => machines.tileExecution(pair)),
    useRfqTile: (pair: CurrencyPair) =>
      useMachine(() => machines.rfqTile(pair)),
    useStaleFlag: (pair: CurrencyPair) =>
      useMachine(() => machines.staleFlag(pair)).state,
    useAnalyticsStaleFlag: () =>
      useMachine(() => machines.analyticsStaleFlag()).state,
    useNotional: (defaultNotional: number) =>
      useMachine(() => machines.notional(defaultNotional)),
    useThroughput: () => ({ ...useThroughputState(), setValue: setThroughput }),
  };
}
