import { bind } from "@react-rxjs/core";
import type { Observable } from "rxjs";
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
  // Commands (one-shot Observables; callers use firstValueFrom)
  useExecuteTrade: () => (input: ExecuteTradeInput) => Observable<ExecuteTradeResult>;
  useCreateRfq: () => (input: CreateRfqInput) => Observable<number>;
  useAcceptQuote: () => (quoteId: number) => Observable<void>;
  useCancelRfq: () => (rfqId: number) => Observable<void>;
  usePassQuote: () => (quoteId: number) => Observable<void>;
  useQuoteRfq: () => (request: QuoteRequest) => Observable<void>;
  useRequestRfqQuote: () => (symbol: string, pipsPosition: number) => Observable<RfqQuoteResult>;
  // Machines (app-layer RxJS behind the useMachine bridge)
  useTileExecution: (pair: CurrencyPair) => { state: TileExecutionState } & TileExecutionIntents;
  useRfqTile: (pair: CurrencyPair) => { state: RfqState } & RfqTileIntents;
  // Intent-free derived flags: return just the boolean (no intents to expose).
  useStaleFlag: (pair: CurrencyPair) => boolean;
  useAnalyticsStaleFlag: () => boolean;
  /** Notional input state for a tile — view state plus intents. */
  useNotional: (defaultNotional: number) => { state: NotionalView } & NotionalIntents;
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

  // Pre-bound command callbacks. Stable references across calls so React
  // memo/effect dep arrays remain stable.
  const executeTrade = (input: ExecuteTradeInput) => presenters.execution.execute(input);
  const createRfq = (input: CreateRfqInput) => presenters.rfqs.createRfq(input);
  const acceptQuote = (quoteId: number) => presenters.rfqs.acceptQuote(quoteId);
  const cancelRfq = (rfqId: number) => presenters.rfqs.cancelRfq(rfqId);
  const passQuote = (quoteId: number) => presenters.rfqs.passQuote(quoteId);
  const quoteRfq = (req: QuoteRequest) => presenters.rfqs.quoteRfq(req);
  const requestRfqQuote = (symbol: string, pipsPosition: number) =>
    presenters.rfqQuote.requestQuote(symbol, pipsPosition);

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
  };
}
