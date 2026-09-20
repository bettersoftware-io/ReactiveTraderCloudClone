import { BehaviorSubject, merge, Observable, Subject } from "rxjs";

import type { AppPorts, ColorSchemeSource, Stream } from "@rtc/core-api";
import type {
  AnalyticsPort,
  BlotterPort,
  ConnectionEvent,
  ConnectionEventsPort,
  CreateRfqRequest,
  CurrencyPair,
  Dealer,
  DealerPort,
  ExecutionPort,
  ExecutionRequest,
  Instrument,
  InstrumentPort,
  PositionUpdates,
  PreferencesPort,
  PriceTick,
  PricingPort,
  QuoteRequest,
  ReferenceDataPort,
  RfqEvent,
  RfqQuoteResult,
  Trade,
  WorkflowPort,
} from "@rtc/domain";

import { createPendingQueue } from "#/harness/pendingQueue";

/** A port method name the discipline suite can count — the `$`-suffixed
 * stream methods of `PreferencesPort`, plus the app-lifetime methods the
 * harness supplies itself: `connectionEvents.events`,
 * `colorScheme.prefersDark$`, the three FX singletons every core calls once
 * at construction, and the three credit singletons every core calls once at
 * construction. `pricing.getPriceUpdates` is deliberately NOT here:
 * a per-key stream is opened per warm period through the use case's
 * `defer`, in the RxJS core as in the others. */
export type PortMethodName =
  | Extract<keyof PreferencesPort, `${string}$`>
  | "connectionEvents.events"
  | "colorScheme.prefersDark$"
  | "referenceData.getCurrencyPairs"
  | "blotter.getTradeStream"
  | "analytics.getAnalytics"
  | "workflow.events"
  | "dealers.getDealers"
  | "instruments.getInstruments";

/** What `pricing.getRfqQuote` was asked for. */
export interface RfqQuoteRequest {
  readonly symbol: string;
  readonly pipsPosition: number;
}

/** One workflow command the core has subscribed, by kind — the five
 * `WorkflowPort` methods share ONE FIFO so a suite reads the order the core
 * issued them in. */
export type WorkflowCommand =
  | { readonly kind: "createRfq"; readonly request: CreateRfqRequest }
  | { readonly kind: "accept"; readonly quoteId: number }
  | { readonly kind: "cancelRfq"; readonly rfqId: number }
  | { readonly kind: "pass"; readonly quoteId: number }
  | { readonly kind: "quote"; readonly request: QuoteRequest };

/** Wrap a port so every method call is counted by name. A Proxy rather than
 * a spread: a class port's methods live on its prototype, which a spread
 * drops. The `get` trap only INSTALLS the counting wrapper; the count
 * happens inside that wrapper, on invocation — so a property read that is
 * never called does not count, and the witness is calls, not reads. */
function countCalls<P extends object>(
  port: P,
  counts: Map<string, number>,
  prefix = "",
): P {
  return new Proxy(port, {
    get: (target: P, property: string | symbol, receiver: unknown) => {
      const value = Reflect.get(target, property, receiver);

      if (typeof value === "function" && typeof property === "string") {
        return (...args: unknown[]) => {
          const key = `${prefix}${property}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return Reflect.apply(value, target, args);
        };
      }

      return value;
    },
  });
}

export interface ScriptedDriver {
  /** Push one connection event into the stream the core observes. */
  emitConnection(event: ConnectionEvent): void;
  /** Error the connection-event stream the core observes — a real source
   * failure, not a domain event, so it reaches `Collected.errors` rather
   * than folding into a status value. Terminal, like the Subject it drives:
   * a later `emitConnection`/`failConnection` is a no-op after this. */
  failConnection(error: unknown): void;
  /** The merged connection-event stream the core sees — includes whatever
   * the runner's base port carries (e.g. the RxJS core's `reconnect$`). */
  connectionEvents$(): Stream<ConnectionEvent>;
  /** Flip the OS colour scheme the theme presenter resolves "system" against. */
  setPrefersDark(on: boolean): void;
  /** How many times the core has invoked this port method since the harness
   * was built — the "called once, at construction" discipline's witness. */
  portCalls(method: PortMethodName): number;
  /** Push one raw tick into `pricing.getPriceUpdates(tick.symbol)`. A tick
   * for a symbol nobody has subscribed reaches nobody. */
  tickPrice(tick: PriceTick): void;
  /** Error that symbol's price stream — terminal for its current subscribers;
   * the next `getPriceUpdates(symbol)` subscription gets a fresh Subject. */
  failPrice(symbol: string, error: unknown): void;
  /** Whether the core currently holds a subscription to that symbol's price
   * stream — the teardown-on-last-unsubscribe witness for per-key streams. */
  priceObserved(symbol: string): boolean;
  /** Push the currency-pair roster into `referenceData.getCurrencyPairs()`. */
  emitPairs(pairs: readonly CurrencyPair[]): void;
  pairsObserved(): boolean;
  /** Push one blotter snapshot into `blotter.getTradeStream()`. */
  emitTrades(trades: readonly Trade[]): void;
  tradesObserved(): boolean;
  /** Push one position update into `analytics.getAnalytics(_)`. */
  emitPosition(update: PositionUpdates): void;
  positionObserved(): boolean;
  /** Every execution request the core has subscribed and the driver has not
   * settled, oldest first. A call of `executeTrade` that nobody subscribed
   * is not here — laziness is the core's property, witnessed through this. */
  pendingExecutions(): readonly ExecutionRequest[];
  /** Settle the OLDEST pending execution with this trade (next + complete).
   * A no-op when nothing is pending. */
  resolveExecution(trade: Trade): void;
  /** Error the OLDEST pending execution. A no-op when nothing is pending. */
  failExecution(error: unknown): void;
  /** Push one raw RFQ event into `workflow.events()`. */
  emitRfqEvent(event: RfqEvent): void;
  rfqEventsObserved(): boolean;
  emitDealers(dealers: readonly Dealer[]): void;
  dealersObserved(): boolean;
  emitInstruments(instruments: readonly Instrument[]): void;
  instrumentsObserved(): boolean;
  /** Every `pricing.getRfqQuote` the core has subscribed and the driver has
   * not settled, oldest first. */
  pendingRfqQuotes(): readonly RfqQuoteRequest[];
  resolveRfqQuote(result: RfqQuoteResult): void;
  failRfqQuote(error: unknown): void;
  /** Every workflow command the core has subscribed and the driver has not
   * settled, oldest first, across all five methods. */
  pendingWorkflowCommands(): readonly WorkflowCommand[];
  /** Settle the OLDEST pending workflow command: `rfqId` is the value a
   * `createRfq` resolves with; the void commands ignore it. */
  resolveWorkflowCommand(rfqId?: number): void;
  failWorkflowCommand(error: unknown): void;
}

export interface ScriptedPorts {
  ports: AppPorts;
  driver: ScriptedDriver;
  teardown(): void;
}

/** Wrap a runner-supplied `AppPorts` so the suites can drive connection
 * events, the colour scheme, the five FX ports and the three credit ports
 * plus `pricing.getRfqQuote` deterministically. The FX and credit ports are
 * REPLACED, not merged: the base simulators tick on real, random timers a
 * suite cannot assert against. Everything else in `base` is passed through
 * untouched — the runner decides what backs it. */
export function scriptPorts(base: AppPorts): ScriptedPorts {
  const connection$ = new Subject<ConnectionEvent>();
  const prefersDark$ = new BehaviorSubject<boolean>(false);
  const calls = new Map<string, number>();
  const preferences = countCalls(base.preferences, calls);
  const prices = new Map<string, Subject<PriceTick>>();
  const pairs$ = new Subject<readonly CurrencyPair[]>();
  const trades$ = new Subject<readonly Trade[]>();
  const position$ = new Subject<PositionUpdates>();
  const executions = createPendingQueue<ExecutionRequest, Trade>();
  const rfqQuotes = createPendingQueue<RfqQuoteRequest, RfqQuoteResult>();
  const commands = createPendingQueue<WorkflowCommand, unknown>();
  const rfqEvents$ = new Subject<RfqEvent>();
  const dealers$ = new Subject<readonly Dealer[]>();
  const instruments$ = new Subject<readonly Instrument[]>();

  // Built ONCE, and handed to both the core (through `connectionEvents`) and
  // the suites (through `driver.connectionEvents$()`), so the two can never
  // observe different merge instances. Rebuilding it per call would be
  // observationally equivalent only while every runner's base port is hot
  // (client-core's `reconnect$` is a bare Subject); against a base port that
  // returns a cold per-subscribe stream, the reconnect suite would go green
  // on a stream the core never saw. The consequence — `base.connectionEvents
  // .events()` is called once here rather than once per subscription — is the
  // intended semantics: one shared stream.
  const events$ = merge(base.connectionEvents.events(), connection$);

  // The ports the harness supplies itself are outside `countCalls`' Proxy,
  // so they count their own calls — on invocation, exactly as the wrapper
  // does.
  function recordCall(method: PortMethodName): void {
    calls.set(method, (calls.get(method) ?? 0) + 1);
  }

  /** The live Subject for a symbol — replaced after a failure, so the next
   * subscription starts clean (a terminated Subject would replay its error). */
  function priceSubject(symbol: string): Subject<PriceTick> {
    const existing = prices.get(symbol);

    if (existing !== undefined && !existing.closed && !existing.hasError) {
      return existing;
    }

    const fresh = new Subject<PriceTick>();
    prices.set(symbol, fresh);
    return fresh;
  }

  const connectionEvents: ConnectionEventsPort = {
    events: (): Observable<ConnectionEvent> => {
      recordCall("connectionEvents.events");
      return events$;
    },
  };

  const colorScheme: ColorSchemeSource = {
    prefersDark$: (): Observable<boolean> => {
      recordCall("colorScheme.prefersDark$");
      return prefersDark$;
    },
  };

  const pricing: PricingPort = {
    // Deferred so each SUBSCRIPTION resolves the live Subject: after a
    // `failPrice` the replacement is what a fresh warm period gets.
    getPriceUpdates: (symbol: string): Observable<PriceTick> => {
      return new Observable<PriceTick>((subscriber) => {
        return priceSubject(symbol).subscribe(subscriber);
      });
    },
    getPriceHistory: (symbol: string): Observable<readonly PriceTick[]> => {
      return base.pricing.getPriceHistory(symbol);
    },
    getRfqQuote: (
      symbol: string,
      pipsPosition: number,
    ): Observable<RfqQuoteResult> => {
      return rfqQuotes.open({ symbol, pipsPosition });
    },
  };

  const referenceData: ReferenceDataPort = {
    getCurrencyPairs: (): Observable<readonly CurrencyPair[]> => {
      recordCall("referenceData.getCurrencyPairs");
      return pairs$;
    },
  };

  const blotter: BlotterPort = {
    getTradeStream: (): Observable<readonly Trade[]> => {
      recordCall("blotter.getTradeStream");
      return trades$;
    },
  };

  const analytics: AnalyticsPort = {
    getAnalytics: (): Observable<PositionUpdates> => {
      recordCall("analytics.getAnalytics");
      return position$;
    },
  };

  const execution: ExecutionPort = {
    // The request becomes pending when the core SUBSCRIBES, not when it
    // calls: a `defer`, so "lazy until subscribed" is the core's property.
    executeTrade: (request: ExecutionRequest): Observable<Trade> => {
      return executions.open(request);
    },
  };

  const workflow: WorkflowPort = {
    events: (): Observable<RfqEvent> => {
      recordCall("workflow.events");
      return rfqEvents$;
    },
    createRfq: (request: CreateRfqRequest): Observable<number> => {
      return commands.open({
        kind: "createRfq",
        request,
      }) as Observable<number>;
    },
    cancelRfq: (rfqId: number): Observable<void> => {
      return commands.open({ kind: "cancelRfq", rfqId }) as Observable<void>;
    },
    quote: (request: QuoteRequest): Observable<void> => {
      return commands.open({ kind: "quote", request }) as Observable<void>;
    },
    pass: (quoteId: number): Observable<void> => {
      return commands.open({ kind: "pass", quoteId }) as Observable<void>;
    },
    accept: (quoteId: number): Observable<void> => {
      return commands.open({ kind: "accept", quoteId }) as Observable<void>;
    },
  };

  const dealers: DealerPort = {
    getDealers: (): Observable<readonly Dealer[]> => {
      recordCall("dealers.getDealers");
      return dealers$;
    },
  };

  const instruments: InstrumentPort = {
    getInstruments: (): Observable<readonly Instrument[]> => {
      recordCall("instruments.getInstruments");
      return instruments$;
    },
  };

  return {
    ports: {
      ...base,
      preferences,
      connectionEvents,
      colorScheme,
      pricing,
      referenceData,
      blotter,
      analytics,
      execution,
      workflow,
      dealers,
      instruments,
    },
    driver: {
      emitConnection: (event: ConnectionEvent) => {
        connection$.next(event);
      },
      failConnection: (error: unknown) => {
        connection$.error(error);
      },
      connectionEvents$: () => {
        return events$;
      },
      setPrefersDark: (on: boolean) => {
        prefersDark$.next(on);
      },
      portCalls: (method: PortMethodName) => {
        return calls.get(method) ?? 0;
      },
      tickPrice: (tick: PriceTick) => {
        prices.get(tick.symbol)?.next(tick);
      },
      failPrice: (symbol: string, error: unknown) => {
        prices.get(symbol)?.error(error);
      },
      priceObserved: (symbol: string) => {
        return prices.get(symbol)?.observed ?? false;
      },
      emitPairs: (next: readonly CurrencyPair[]) => {
        pairs$.next(next);
      },
      pairsObserved: () => {
        return pairs$.observed;
      },
      emitTrades: (next: readonly Trade[]) => {
        trades$.next(next);
      },
      tradesObserved: () => {
        return trades$.observed;
      },
      emitPosition: (update: PositionUpdates) => {
        position$.next(update);
      },
      positionObserved: () => {
        return position$.observed;
      },
      pendingExecutions: executions.pending,
      resolveExecution: executions.resolve,
      failExecution: executions.fail,
      emitRfqEvent: (event: RfqEvent) => {
        rfqEvents$.next(event);
      },
      rfqEventsObserved: () => {
        return rfqEvents$.observed;
      },
      emitDealers: (next: readonly Dealer[]) => {
        dealers$.next(next);
      },
      dealersObserved: () => {
        return dealers$.observed;
      },
      emitInstruments: (next: readonly Instrument[]) => {
        instruments$.next(next);
      },
      instrumentsObserved: () => {
        return instruments$.observed;
      },
      pendingRfqQuotes: rfqQuotes.pending,
      resolveRfqQuote: rfqQuotes.resolve,
      failRfqQuote: rfqQuotes.fail,
      pendingWorkflowCommands: commands.pending,
      resolveWorkflowCommand: (rfqId?: number) => {
        commands.resolve(rfqId);
      },
      failWorkflowCommand: commands.fail,
    },
    teardown: () => {
      connection$.complete();
      prefersDark$.complete();

      for (const subject of prices.values()) {
        subject.complete();
      }

      pairs$.complete();
      trades$.complete();
      position$.complete();
      executions.drain();
      rfqQuotes.drain();
      commands.drain();
      rfqEvents$.complete();
      dealers$.complete();
      instruments$.complete();
    },
  };
}
