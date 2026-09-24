import {
  BehaviorSubject,
  defer,
  merge,
  Observable,
  of,
  ReplaySubject,
  Subject,
} from "rxjs";

import type {
  AppPorts,
  ColorSchemeSource,
  DockLayoutStore,
  JarvisAskOptions,
  JarvisAvailability,
  JarvisPort,
  JarvisUsagePort,
  LayoutPresetStore,
  SessionStore,
  StoredSession,
  Stream,
  WorkspaceTab,
} from "@rtc/core-api";
import type {
  AdminPort,
  AnalyticsPort,
  AnomalyDetectorConfig,
  AuthOutcome,
  AuthPort,
  BlotterPort,
  Candle,
  CandleTimeframe,
  ConnectionEvent,
  ConnectionEventsPort,
  CreateRfqRequest,
  CurrencyPair,
  Dealer,
  DealerPort,
  DepthBook,
  EquityInstrument,
  EquityOrder,
  EquityPosition,
  EquityQuote,
  EventLogPort,
  ExecutionPort,
  ExecutionRequest,
  Instrument,
  InstrumentPort,
  LogEvent,
  MarketDataPort,
  MetricControl,
  MetricSample,
  OrderPort,
  Perturbation,
  PlaceOrderRequest,
  PositionPort,
  PositionUpdates,
  PreferencesPort,
  PriceTick,
  PricingPort,
  QuoteRequest,
  ReferenceDataPort,
  RfqEvent,
  RfqQuoteResult,
  ServiceHealthPort,
  ServiceTopology,
  SessionInfo,
  SessionsPort,
  TelemetryPort,
  Trade,
  WorkflowPort,
} from "@rtc/domain";
import { DEFAULT_LOGIN_WAIT_VARIANT, type LoginWaitVariant } from "@rtc/domain";

import type {
  JarvisEvent,
  JarvisHistoryEntry,
  JarvisUsagePayload,
} from "#/harness/jarvisTypes";
import { createPendingQueue } from "#/harness/pendingQueue";

/** A port method name the discipline suite can count — the `$`-suffixed
 * stream methods of `PreferencesPort`, plus the app-lifetime methods the
 * harness supplies itself: `connectionEvents.events`,
 * `colorScheme.prefersDark$`, the three FX singletons every core calls once
 * at construction, the three credit singletons every core calls once at
 * construction, the two equities singletons every core calls once at
 * construction, and the seven admin singletons every core calls once at
 * construction: telemetry's three streams, `serviceHealth.topology$`,
 * `eventLog.events$`, `sessions.sessions$`, and `admin.getThroughput`.
 * `pricing.getPriceUpdates` is deliberately NOT here: a per-key stream is
 * opened per warm period through the use case's `defer`, in the RxJS core
 * as in the others. `marketData.quotes/candles/depth` are per-key and
 * `candleHistory`, `orders.place`, `orders.orders` per-invocation — none of
 * them under the constancy rule. `admin.setThroughput` is likewise NOT
 * here: it is called once per user edit, not once at construction. */
export type PortMethodName =
  | Extract<keyof PreferencesPort, `${string}$`>
  | "connectionEvents.events"
  | "colorScheme.prefersDark$"
  | "referenceData.getCurrencyPairs"
  | "blotter.getTradeStream"
  | "analytics.getAnalytics"
  | "workflow.events"
  | "dealers.getDealers"
  | "instruments.getInstruments"
  | "marketData.watchlist"
  | "positions.positions"
  | "telemetry.throughput$"
  | "telemetry.latency$"
  | "telemetry.errorRate$"
  | "serviceHealth.topology$"
  | "eventLog.events$"
  | "sessions.sessions$"
  | "admin.getThroughput"
  | "auth.login"
  | "jarvis.ask"
  | "jarvis.confirm"
  | "jarvis.availability$"
  | "jarvis.setHistorySource"
  | "jarvisUsage.usage$";

/** What `pricing.getRfqQuote` was asked for. */
export interface RfqQuoteRequest {
  readonly symbol: string;
  readonly pipsPosition: number;
}

/** What the world holds BEFORE the app is composed. `eqWorkspace` reads the
 * watchlist once, synchronously, at composition (the simulator's
 * `of(WATCHLIST)` path, the deployed default) — a roster pushed through
 * `emitWatchlist` can only ever exercise the asynchronous fallback. */
export interface HarnessSeed {
  readonly watchlist?: readonly EquityInstrument[];
  /** The session the store holds before composition — what `auth` resumes
   * from. Absent: an empty store. */
  readonly session?: StoredSession | null;
  /** `ports.bootSplash.shouldPlay()`. Absent: no `bootSplash` port at all
   * (the base's, if it has one, is passed through). */
  readonly bootSplash?: boolean;
  /** The stored `workspaceLayout` preference before composition. Absent:
   * whatever the base preferences port holds. */
  readonly workspaceLayout?: string | null;
  /** `ports.dockLayoutStore`'s blobs before composition. Absent: no
   * `dockLayoutStore` port at all (each core builds its own fallback). */
  readonly dockLayouts?: Partial<Record<WorkspaceTab, string>>;
  /** `ports.layoutPresetStore`'s serialized lists before composition.
   * Absent (with `presetStoreDropsWrites` also absent): no port. */
  readonly layoutPresets?: Partial<Record<WorkspaceTab, string>>;
  /** The preset store accepts every write and keeps none — blocked or full
   * storage, the `storage-failed` save outcome. */
  readonly presetStoreDropsWrites?: boolean;
  /** What `jarvis.availability$()` replays first. Absent: the simulator's
   * always-available, scripted-only value. */
  readonly jarvisAvailability?: JarvisAvailability;
  /** `ports.narratorConfig` — the detector thresholds. Absent: the base's. */
  readonly narratorConfig?: Partial<AnomalyDetectorConfig>;
}

/** One `auth.login(username, password)` the core has subscribed. */
interface LoginCall {
  readonly username: string;
  readonly password: string;
}

/** What `marketData.candleHistory` was asked for. */
export interface CandleHistoryRequest {
  readonly symbol: string;
  readonly timeframe: CandleTimeframe;
  readonly beforeTime: number;
  readonly count: number;
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

/** One call the core has made against a `metricControls` entry, by its
 * index (0..2) — the `IncidentMachine` contract's witness that every
 * control is perturbed/cleared, in `metricControls` order, on every
 * `inject`/`clear` intent. */
export type ControlCall =
  | {
      readonly control: number;
      readonly call: "perturb";
      readonly kind: Perturbation;
    }
  | { readonly control: number; readonly call: "clear" };

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
  /** Push the equities roster into `marketData.watchlist()`. */
  emitWatchlist(list: readonly EquityInstrument[]): void;
  watchlistObserved(): boolean;
  /** Push one equity quote into `marketData.quotes(quote.symbol)`. An
   * emission for a key nobody has subscribed reaches nobody (the key's
   * Subject is created on first subscribe). */
  emitEquityQuote(quote: EquityQuote): void;
  equityQuoteObserved(symbol: string): boolean;
  /** Push one candle series into `marketData.candles(symbol, timeframe)`. An
   * emission for a key nobody has subscribed reaches nobody (the key's
   * Subject is created on first subscribe). */
  emitCandles(
    symbol: string,
    timeframe: CandleTimeframe,
    candles: readonly Candle[],
  ): void;
  candlesObserved(symbol: string, timeframe: CandleTimeframe): boolean;
  /** Every `marketData.candleHistory` the core has subscribed and the
   * driver has not settled, oldest first. */
  pendingCandleHistory(): readonly CandleHistoryRequest[];
  /** Settle the OLDEST pending candle-history request with this page (next
   * + complete). A no-op when nothing is pending. */
  resolveCandleHistory(page: readonly Candle[]): void;
  /** Error the OLDEST pending candle-history request. A no-op when nothing
   * is pending. */
  failCandleHistory(error: unknown): void;
  /** Push one depth book into `marketData.depth(book.symbol)`. An emission
   * for a key nobody has subscribed reaches nobody (the key's Subject is
   * created on first subscribe). */
  emitDepth(book: DepthBook): void;
  depthObserved(symbol: string): boolean;
  /** Replace the book `orders.orders()` snapshots on the NEXT subscribe. */
  setOrderBook(orders: readonly EquityOrder[]): void;
  /** Every `orders.place` the core has subscribed and the driver has not
   * completed, oldest first. */
  pendingOrders(): readonly PlaceOrderRequest[];
  /** Next on the OLDEST pending `orders.place` request; it stays pending. */
  emitOrderUpdate(order: EquityOrder): void;
  /** Complete the OLDEST pending `orders.place` request and drop it. */
  completeOrder(): void;
  /** Error the OLDEST pending `orders.place` request. A no-op when nothing
   * is pending. */
  failOrder(error: unknown): void;
  /** Push one positions snapshot into `positions.positions()`. */
  emitPositions(positions: readonly EquityPosition[]): void;
  positionsObserved(): boolean;
  /** Push one sample into `telemetry.throughput$()`; reaches only that
   * method's own subscribers — a separate `Subject` from `latency$`/
   * `errorRate$`. */
  emitThroughputSample(sample: MetricSample): void;
  /** Push one sample into `telemetry.latency$()`. */
  emitLatencySample(sample: MetricSample): void;
  /** Push one sample into `telemetry.errorRate$()`. */
  emitErrorRateSample(sample: MetricSample): void;
  /** Push one topology snapshot into `serviceHealth.topology$()`. */
  emitTopology(topology: ServiceTopology): void;
  /** Push one log line into `eventLog.events$()`. */
  emitLogEvent(event: LogEvent): void;
  /** Push one sessions snapshot into `sessions.sessions$()`. */
  emitSessions(sessions: readonly SessionInfo[]): void;
  /** How many `admin.getThroughput()` calls the core has subscribed and the
   * driver has not yet settled. */
  pendingThroughputLoads(): number;
  /** Settle the OLDEST pending `getThroughput()` load with this value (next
   * + complete). A no-op when nothing is pending. */
  resolveThroughputLoad(value: number): void;
  /** Error the OLDEST pending `getThroughput()` load. A no-op when nothing
   * is pending. */
  failThroughputLoad(error: unknown): void;
  /** Every value the core has subscribed to `admin.setThroughput(value)`
   * and the driver has not settled, oldest first. */
  pendingThroughputWrites(): readonly number[];
  /** Settle the OLDEST pending `setThroughput` write (next `undefined` +
   * complete). A no-op when nothing is pending. */
  resolveThroughputWrite(): void;
  /** Error the OLDEST pending `setThroughput` write. A no-op when nothing
   * is pending. */
  failThroughputWrite(error: unknown): void;
  /** Every call the core has made against a `metricControls` entry (three
   * recording controls, index 0..2), in order. */
  controlCalls(): readonly ControlCall[];
  /** Every `auth.login` the core has subscribed and the driver has not
   * settled, oldest first. */
  pendingLogins(): readonly LoginCall[];
  /** Settle the OLDEST pending login with this outcome (next + complete). A
   * no-op when nothing is pending. */
  resolveLogin(outcome: AuthOutcome): void;
  /** What the session store holds now. */
  storedSession(): StoredSession | null;
  /** The login-wait variant the preferences port holds now — read on the
   * UNCOUNTED base port, so reading it never moves `portCalls`. */
  storedLoginWaitVariant(): LoginWaitVariant;
  /** The text of every `jarvis.ask` the core has subscribed and the driver
   * has not finished replying to, oldest first. */
  pendingAsks(): readonly string[];
  /** Reply to the OLDEST pending ask with `events`, in order; a trailing
   * `done`/`error` event also completes that turn. */
  replyJarvis(events: readonly JarvisEvent[]): void;
  /** Every `jarvis.ask` ever subscribed, in order — its text and options —
   * including the ones already replied to. */
  askLog(): readonly JarvisAskRecord[];
  /** Every `jarvis.confirm` call, in order. */
  confirmations(): readonly JarvisConfirmRecord[];
  /** Push the next `jarvis.availability$()` value. */
  pushJarvisAvailability(availability: JarvisAvailability): void;
  /** What the core's registered history source returns NOW, or `null`
   * when no core has called `jarvis.setHistorySource`. */
  jarvisHistory(): readonly JarvisHistoryEntry[] | null;
  /** Push the next `jarvisUsage.usage$()` snapshot. */
  pushJarvisUsage(payload: JarvisUsagePayload): void;
  /** The `workspaceLayout` preference now — read on the UNCOUNTED base
   * port. */
  storedWorkspaceLayout(): string | null;
  /** The dock-layout blob `ports.dockLayoutStore` holds for `tab` (null
   * when the harness supplied no store). */
  dockLayout(tab: WorkspaceTab): string | null;
  /** The serialized preset list `ports.layoutPresetStore` holds for `tab`
   * (null when the harness supplied no store). */
  presetList(tab: WorkspaceTab): string | null;
}

/** One `jarvis.ask` the core made. */
export interface JarvisAskRecord {
  readonly text: string;
  readonly options: JarvisAskOptions | undefined;
}

/** One `jarvis.confirm` the core made. */
export interface JarvisConfirmRecord {
  readonly id: string;
  readonly approved: boolean;
}

/** The simulator's availability: always on, the scripted brain only. */
const SIM_JARVIS_AVAILABILITY: JarvisAvailability = {
  available: true,
  brains: ["scripted"],
  defaultBrain: "scripted",
  gate: null,
};

export interface ScriptedPorts {
  ports: AppPorts;
  driver: ScriptedDriver;
  teardown(): void;
}

/** Wrap a runner-supplied `AppPorts` so the suites can drive connection
 * events, the colour scheme, the five FX ports, the three credit ports plus
 * `pricing.getRfqQuote`, and the three equities ports deterministically. The
 * FX and credit ports are REPLACED, not merged: the base simulators tick on
 * real, random timers a suite cannot assert against. Everything else in
 * `base` is passed through untouched — the runner decides what backs it. */
export function scriptPorts(
  base: AppPorts,
  seed: HarnessSeed = {},
): ScriptedPorts {
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
  const watchlist$ = new ReplaySubject<readonly EquityInstrument[]>(1);
  const equityQuotes = new Map<string, Subject<EquityQuote>>();
  const candleSeries = new Map<string, Subject<readonly Candle[]>>();
  const depthBooks = new Map<string, Subject<DepthBook>>();
  const candleHistory = createPendingQueue<
    CandleHistoryRequest,
    readonly Candle[]
  >();
  const orderPlacements = createPendingQueue<PlaceOrderRequest, EquityOrder>();
  const positions$ = new Subject<readonly EquityPosition[]>();
  let orderBook: readonly EquityOrder[] = [];
  const throughputSamples$ = new Subject<MetricSample>();
  const latencySamples$ = new Subject<MetricSample>();
  const errorRateSamples$ = new Subject<MetricSample>();
  const topology$ = new Subject<ServiceTopology>();
  const logEvents$ = new Subject<LogEvent>();
  const sessionsList$ = new Subject<readonly SessionInfo[]>();
  const throughputLoads = createPendingQueue<void, number>();
  const throughputWrites = createPendingQueue<number, void>();
  const logins = createPendingQueue<LoginCall, AuthOutcome>();
  const asks = createPendingQueue<string, JarvisEvent>();
  const askLog: JarvisAskRecord[] = [];
  const confirmations: JarvisConfirmRecord[] = [];
  const availability$ = new BehaviorSubject<JarvisAvailability>(
    seed.jarvisAvailability ?? SIM_JARVIS_AVAILABILITY,
  );
  const usage$ = new Subject<JarvisUsagePayload>();
  let historySource: (() => readonly JarvisHistoryEntry[]) | null = null;

  if (seed.workspaceLayout !== undefined) {
    base.preferences.setWorkspaceLayout(seed.workspaceLayout);
  }

  const dockBlobs = new Map<string, string>(
    Object.entries(seed.dockLayouts ?? {}),
  );

  const presetLists = new Map<string, string>(
    Object.entries(seed.layoutPresets ?? {}),
  );

  const dockLayoutStore: DockLayoutStore | undefined =
    seed.dockLayouts === undefined
      ? base.dockLayoutStore
      : createMapStore(dockBlobs, false);

  const layoutPresetStore: LayoutPresetStore | undefined =
    seed.layoutPresets === undefined && seed.presetStoreDropsWrites !== true
      ? base.layoutPresetStore
      : createMapStore(presetLists, seed.presetStoreDropsWrites === true);
  let stored: StoredSession | null = seed.session ?? null;
  const controlCallLog: ControlCall[] = [];
  const metricControls: readonly MetricControl[] = [0, 1, 2].map(
    (index): MetricControl => {
      return {
        perturb: (kind: Perturbation) => {
          controlCallLog.push({ control: index, call: "perturb", kind });
        },
        clearPerturbation: () => {
          controlCallLog.push({ control: index, call: "clear" });
        },
      };
    },
  );

  if (seed.watchlist !== undefined) {
    watchlist$.next(seed.watchlist);
  }

  function candleKey(
    symbol: string,
    timeframe: CandleTimeframe = "1D",
  ): string {
    return `${symbol}|${timeframe}`;
  }

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

  /** The live Subject for a key — replaced after a failure, so the next
   * subscription starts clean (a terminated Subject would replay its error). */
  function liveSubject<T>(
    subjects: Map<string, Subject<T>>,
    key: string,
  ): Subject<T> {
    const existing = subjects.get(key);

    if (existing !== undefined && !existing.closed && !existing.hasError) {
      return existing;
    }

    const fresh = new Subject<T>();
    subjects.set(key, fresh);
    return fresh;
  }

  /** A per-key port stream: deferred so each SUBSCRIPTION resolves the live
   * Subject. */
  function keyedStream<T>(
    subjects: Map<string, Subject<T>>,
    key: string,
  ): Observable<T> {
    return new Observable<T>((subscriber) => {
      return liveSubject(subjects, key).subscribe(subscriber);
    });
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
      return keyedStream(prices, symbol);
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

  const marketData: MarketDataPort = {
    watchlist: (): Observable<readonly EquityInstrument[]> => {
      recordCall("marketData.watchlist");
      return watchlist$;
    },
    quotes: (symbol: string): Observable<EquityQuote> => {
      return keyedStream(equityQuotes, symbol);
    },
    candles: (
      symbol: string,
      timeframe?: CandleTimeframe,
    ): Observable<readonly Candle[]> => {
      return keyedStream(candleSeries, candleKey(symbol, timeframe));
    },
    candleHistory: (
      symbol: string,
      timeframe: CandleTimeframe,
      beforeTime: number,
      count: number,
    ): Observable<readonly Candle[]> => {
      return candleHistory.open({ symbol, timeframe, beforeTime, count });
    },
    depth: (symbol: string): Observable<DepthBook> => {
      return keyedStream(depthBooks, symbol);
    },
  };

  const orders: OrderPort = {
    // A lifecycle stream: pending from SUBSCRIBE, several updates, then
    // (optionally) completion.
    place: (request: PlaceOrderRequest): Observable<EquityOrder> => {
      return orderPlacements.open(request);
    },
    // No presenter cancels an order today; the base keeps the method honest.
    cancel: (orderId: string): Observable<void> => {
      return base.orders.cancel(orderId);
    },
    // A one-shot snapshot of whatever the book holds when SUBSCRIBED.
    orders: (): Observable<readonly EquityOrder[]> => {
      return defer(() => {
        return of(orderBook);
      });
    },
  };

  const positions: PositionPort = {
    positions: (): Observable<readonly EquityPosition[]> => {
      recordCall("positions.positions");
      return positions$;
    },
  };

  // The five admin ports are counted through the same Proxy `preferences`
  // uses — one prefix per port — rather than a `recordCall` per method: each
  // carries more than one method (telemetry, admin), so wrapping the whole
  // port once is the same economy `preferences` gets.
  const telemetry = countCalls<TelemetryPort>(
    {
      throughput$: (): Observable<MetricSample> => {
        return throughputSamples$;
      },
      latency$: (): Observable<MetricSample> => {
        return latencySamples$;
      },
      errorRate$: (): Observable<MetricSample> => {
        return errorRateSamples$;
      },
    },
    calls,
    "telemetry.",
  );

  const serviceHealth = countCalls<ServiceHealthPort>(
    {
      topology$: (): Observable<ServiceTopology> => {
        return topology$;
      },
    },
    calls,
    "serviceHealth.",
  );

  const eventLog = countCalls<EventLogPort>(
    {
      events$: (): Observable<LogEvent> => {
        return logEvents$;
      },
    },
    calls,
    "eventLog.",
  );

  const sessions = countCalls<SessionsPort>(
    {
      sessions$: (): Observable<readonly SessionInfo[]> => {
        return sessionsList$;
      },
    },
    calls,
    "sessions.",
  );

  const admin = countCalls<AdminPort>(
    {
      getThroughput: (): Observable<number> => {
        return throughputLoads.open(undefined);
      },
      setThroughput: (value: number): Observable<void> => {
        return throughputWrites.open(value);
      },
    },
    calls,
    "admin.",
  );

  const auth = countCalls<AuthPort>(
    {
      login: (username: string, password: string): Observable<AuthOutcome> => {
        return logins.open({ username, password });
      },
    },
    calls,
    "auth.",
  );

  const jarvis = countCalls<JarvisPort>(
    {
      ask: (
        text: string,
        options?: JarvisAskOptions,
      ): Observable<JarvisEvent> => {
        return defer(() => {
          askLog.push({ text, options });
          return asks.open(text);
        });
      },
      confirm: (confirmationId: string, approved: boolean): void => {
        confirmations.push({ id: confirmationId, approved });
      },
      availability$: (): Observable<JarvisAvailability> => {
        return availability$;
      },
      setHistorySource: (source: () => readonly JarvisHistoryEntry[]) => {
        historySource = source;
      },
    },
    calls,
    "jarvis.",
  );

  const jarvisUsage = countCalls<JarvisUsagePort>(
    {
      usage$: (): Observable<JarvisUsagePayload> => {
        return usage$;
      },
    },
    calls,
    "jarvisUsage.",
  );

  const sessionStore: SessionStore = {
    read: () => {
      return stored;
    },
    write: (session: StoredSession) => {
      stored = session;
    },
    clear: () => {
      stored = null;
    },
  };
  const bootSplashSeed = seed.bootSplash;
  const bootSplash =
    bootSplashSeed === undefined
      ? base.bootSplash
      : {
          shouldPlay: (): boolean => {
            return bootSplashSeed;
          },
        };

  return {
    ports: {
      ...base,
      auth,
      sessionStore,
      bootSplash,
      jarvis,
      jarvisUsage,
      narratorConfig: seed.narratorConfig ?? base.narratorConfig,
      dockLayoutStore,
      layoutPresetStore,
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
      marketData,
      orders,
      positions,
      telemetry,
      serviceHealth,
      eventLog,
      sessions,
      admin,
      metricControls,
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
      emitWatchlist: (list: readonly EquityInstrument[]) => {
        watchlist$.next(list);
      },
      watchlistObserved: () => {
        return watchlist$.observed;
      },
      emitEquityQuote: (quote: EquityQuote) => {
        equityQuotes.get(quote.symbol)?.next(quote);
      },
      equityQuoteObserved: (symbol: string) => {
        return equityQuotes.get(symbol)?.observed ?? false;
      },
      emitCandles: (
        symbol: string,
        timeframe: CandleTimeframe,
        candles: readonly Candle[],
      ) => {
        candleSeries.get(candleKey(symbol, timeframe))?.next(candles);
      },
      candlesObserved: (symbol: string, timeframe: CandleTimeframe) => {
        return (
          candleSeries.get(candleKey(symbol, timeframe))?.observed ?? false
        );
      },
      pendingCandleHistory: candleHistory.pending,
      resolveCandleHistory: candleHistory.resolve,
      failCandleHistory: candleHistory.fail,
      emitDepth: (book: DepthBook) => {
        depthBooks.get(book.symbol)?.next(book);
      },
      depthObserved: (symbol: string) => {
        return depthBooks.get(symbol)?.observed ?? false;
      },
      setOrderBook: (next: readonly EquityOrder[]) => {
        orderBook = next;
      },
      pendingOrders: orderPlacements.pending,
      emitOrderUpdate: orderPlacements.emit,
      completeOrder: orderPlacements.complete,
      failOrder: orderPlacements.fail,
      emitPositions: (next: readonly EquityPosition[]) => {
        positions$.next(next);
      },
      positionsObserved: () => {
        return positions$.observed;
      },
      emitThroughputSample: (sample: MetricSample) => {
        throughputSamples$.next(sample);
      },
      emitLatencySample: (sample: MetricSample) => {
        latencySamples$.next(sample);
      },
      emitErrorRateSample: (sample: MetricSample) => {
        errorRateSamples$.next(sample);
      },
      emitTopology: (next: ServiceTopology) => {
        topology$.next(next);
      },
      emitLogEvent: (event: LogEvent) => {
        logEvents$.next(event);
      },
      emitSessions: (next: readonly SessionInfo[]) => {
        sessionsList$.next(next);
      },
      pendingThroughputLoads: () => {
        return throughputLoads.pending().length;
      },
      resolveThroughputLoad: throughputLoads.resolve,
      failThroughputLoad: throughputLoads.fail,
      pendingThroughputWrites: throughputWrites.pending,
      resolveThroughputWrite: () => {
        throughputWrites.resolve(undefined);
      },
      failThroughputWrite: throughputWrites.fail,
      controlCalls: () => {
        return controlCallLog.slice();
      },
      pendingLogins: logins.pending,
      resolveLogin: logins.resolve,
      storedSession: () => {
        return stored;
      },
      pendingAsks: asks.pending,
      replyJarvis: (events: readonly JarvisEvent[]) => {
        for (const event of events) {
          asks.emit(event);
        }

        const last = events.at(-1);

        if (last?.type === "done" || last?.type === "error") {
          asks.complete();
        }
      },
      askLog: () => {
        return [...askLog];
      },
      confirmations: () => {
        return [...confirmations];
      },
      pushJarvisAvailability: (availability: JarvisAvailability) => {
        availability$.next(availability);
      },
      jarvisHistory: () => {
        return historySource === null ? null : historySource();
      },
      pushJarvisUsage: (payload: JarvisUsagePayload) => {
        usage$.next(payload);
      },
      storedWorkspaceLayout: () => {
        const seen: (string | null)[] = [];
        base.preferences
          .workspaceLayout$()
          .subscribe((value) => {
            seen.push(value);
          })
          .unsubscribe();

        // Absence must not read as a stored `null`.
        if (seen.length === 0) {
          throw new Error(
            "storedWorkspaceLayout: the preferences port replayed nothing",
          );
        }

        return seen[seen.length - 1];
      },
      dockLayout: (tab: WorkspaceTab) => {
        return seed.dockLayouts === undefined
          ? null
          : (dockBlobs.get(tab) ?? null);
      },
      presetList: (tab: WorkspaceTab) => {
        return presetLists.get(tab) ?? null;
      },
      storedLoginWaitVariant: () => {
        let variant: LoginWaitVariant = DEFAULT_LOGIN_WAIT_VARIANT;
        base.preferences
          .loginWaitVariant$()
          .subscribe((v) => {
            variant = v;
          })
          .unsubscribe();

        return variant;
      },
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
      watchlist$.complete();

      for (const subject of equityQuotes.values()) {
        subject.complete();
      }

      for (const subject of candleSeries.values()) {
        subject.complete();
      }

      for (const subject of depthBooks.values()) {
        subject.complete();
      }

      candleHistory.drain();
      orderPlacements.drain();
      positions$.complete();
      throughputSamples$.complete();
      latencySamples$.complete();
      errorRateSamples$.complete();
      topology$.complete();
      logEvents$.complete();
      sessionsList$.complete();
      throughputLoads.drain();
      throughputWrites.drain();
      logins.drain();
      asks.drain();
      availability$.complete();
      usage$.complete();
    },
  };
}

/** A Map-backed store with the `DockLayoutStore`/`LayoutPresetStore` shape
 * (this package cannot import client-core's in-memory ones). `dropWrites`
 * accepts every `save` and keeps nothing. */
function createMapStore(
  entries: Map<string, string>,
  dropWrites: boolean,
): DockLayoutStore & LayoutPresetStore {
  return {
    load: (tab: string): string | null => {
      return entries.get(tab) ?? null;
    },
    save: (tab: string, value: string): void => {
      if (!dropWrites) {
        entries.set(tab, value);
      }
    },
    clear: (tab: string): void => {
      entries.delete(tab);
    },
  };
}
