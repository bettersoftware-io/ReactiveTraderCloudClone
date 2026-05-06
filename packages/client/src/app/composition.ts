import { bind } from "@react-rxjs/core";
import { concatMap, from, merge, of, type Observable } from "rxjs";
import {
  ConnectionStatus,
  type ConnectionEvent,
  type ConnectionEventsPort,
  type CurrencyPair, type Price, type PriceTick, type Trade,
  type Rfq, type Quote, type PositionUpdates,
  type Instrument, type Dealer,
  type ExecuteTradeInput, type ExecuteTradeResult, type CreateRfqInput,
  type RfqQuoteResult, type QuoteRequest,
} from "@rtc/domain";

import { PriceStreamPresenter } from "./presenters/PriceStreamPresenter";
import { PriceHistoryPresenter } from "./presenters/PriceHistoryPresenter";
import { TradeExecutionPresenter } from "./presenters/TradeExecutionPresenter";
import { BlotterPresenter } from "./presenters/BlotterPresenter";
import { AnalyticsPresenter } from "./presenters/AnalyticsPresenter";
import { RfqsPresenter } from "./presenters/RfqsPresenter";
import { CurrencyPairsPresenter } from "./presenters/CurrencyPairsPresenter";
import { InstrumentsPresenter } from "./presenters/InstrumentsPresenter";
import { DealersPresenter } from "./presenters/DealersPresenter";
import { ConnectionStatusPresenter } from "./presenters/ConnectionStatusPresenter";
import { RfqQuotePresenter } from "./presenters/RfqQuotePresenter";

import { WsAdapter } from "./adapters/WsAdapter";
import { BrowserConnectionEventsAdapter } from "./adapters/BrowserConnectionEventsAdapter";
import {
  createSimulatorPorts,
  createWsRealPorts,
  type AppPorts,
} from "./adapters/portFactory";

export type { AppPorts };

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
}

/**
 * Wraps the BrowserConnectionEventsAdapter with a synthetic startup
 * `gatewayConnected` event so the state machine reaches CONNECTED
 * during application boot. Also synthesizes a `gatewayConnected` event
 * after every `browserOnline` event so that coming back from offline
 * returns to CONNECTED (not just CONNECTING). In future phases a real
 * gateway adapter will replace these synthetic emissions.
 */
function withSyntheticGatewayConnected(
  inner: ConnectionEventsPort,
): ConnectionEventsPort {
  return {
    events(): Observable<ConnectionEvent> {
      const innerEvents$ = inner.events().pipe(
        concatMap((event) => {
          if (event.type === "browserOnline") {
            // Emit browserOnline then immediately follow with gatewayConnected
            // so the state machine moves OFFLINE_DISCONNECTED → CONNECTING → CONNECTED.
            const pair: ConnectionEvent[] = [event, { type: "gatewayConnected" }];
            return from(pair);
          }
          return of(event);
        }),
      );
      return merge(of<ConnectionEvent>({ type: "gatewayConnected" }), innerEvents$);
    },
  };
}

export function buildDefaultPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const transport = url ? createWsRealPorts(new WsAdapter(url)) : createSimulatorPorts();
  return {
    ...transport,
    connectionEvents: withSyntheticGatewayConnected(new BrowserConnectionEventsAdapter()),
  };
}

export function createApp(ports: AppPorts = buildDefaultPorts()): AppHooks {
  const presenters = {
    priceStream: new PriceStreamPresenter(ports.pricing),
    priceHistory: new PriceHistoryPresenter(ports.pricing),
    execution: new TradeExecutionPresenter(ports.execution),
    blotter: new BlotterPresenter(ports.blotter),
    analytics: new AnalyticsPresenter(ports.analytics),
    rfqs: new RfqsPresenter(ports.workflow),
    currencyPairs: new CurrencyPairsPresenter(ports.referenceData),
    instruments: new InstrumentsPresenter(ports.instruments),
    dealers: new DealersPresenter(ports.dealers),
    connection: new ConnectionStatusPresenter(ports.connectionEvents),
    rfqQuote: new RfqQuotePresenter(ports.pricing),
  };

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

  // Command callbacks are constructed once at createApp time so each use*()
  // returns a stable reference. This avoids useCallback (keeping createApp
  // React-free) while preserving the stable-reference contract React consumers
  // rely on for memo/effect dep arrays.
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
  };
}
