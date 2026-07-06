import { BehaviorSubject, Subject } from "rxjs";

import type {
  ActivityEntry,
  AnimationIntent,
  EqWorkspaceState,
  IncidentKind,
  IncidentState,
  ThroughputView,
} from "@rtc/client-core";
import {
  createEqWorkspaceMachine,
  DEMO_USER,
  type EqWorkspaceIntents,
  type Machine,
  type SessionState,
} from "@rtc/client-core";
import {
  type Candle,
  ConnectionStatus,
  type CreateRfqInput,
  type CurrencyPair,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_VIEW_MODE,
  type Dealer,
  type DepthBook,
  type EqBlotterView,
  type EquityInstrument,
  type EquityOrder,
  type EquityPosition,
  type EquityQuote,
  type EqWatchlistSort,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  type Instrument,
  type LogEvent,
  type MetricSample,
  type PositionUpdates,
  type Price,
  type PriceTick,
  type Quote,
  type QuoteRequest,
  type Rfq,
  type RfqQuoteResult,
  type ServiceTopology,
  type SessionInfo,
  type ThemeModePreference,
  type ThemeSkin,
  type Trade,
  type ViewMode,
} from "@rtc/domain";

/** The value each NULLARY query hook yields. Parametric hooks (usePrice etc.)
 *  are modelled by the per-key subject maps below, not by this map. */
export interface HookValues {
  useConnectionStatus: ConnectionStatus;
  useTrades: readonly Trade[];
  useActivity: readonly ActivityEntry[];
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
  useActivity: [],
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
  /** Quotes per RFQ, keyed by rfqId (mirrors useQuotesForRfq(rfqId)). */
  quotesForRfq?: Readonly<Record<number, readonly Quote[]>>;
}

/**
 * Seed values for the EQUITIES query hooks. Watchlist, orders, and positions are
 * single shared streams (useWatchlist / useEquityOrders / useEquityPositions);
 * quotes, candles, and depth are keyed by symbol, mirroring the per-argument
 * binds of the real createViewModel (watchlist.quote$, candleSeries.candles$,
 * depth.depth$). The OrderTicket place lifecycle is driven separately via
 * {@link World.orderLifecycle} (a plain Subject the page object pushes onto).
 */
export interface EquitiesSeed {
  watchlist?: readonly EquityInstrument[];
  orders?: readonly EquityOrder[];
  positions?: readonly EquityPosition[];
  quotes?: Readonly<Record<string, EquityQuote | null>>;
  candles?: Readonly<Record<string, readonly Candle[]>>;
  depth?: Readonly<Record<string, DepthBook | null>>;
  /** Seeds the eqWorkspace machine's initial selection/open tab (mirrors the
   * composition root's synchronous first-watchlist-symbol peek). Defaults to
   * `watchlist`'s first symbol, or "" if neither is provided. */
  initialSymbol?: string;
  /** Seeds the watchlist sort-mode preference (useEqWatchlistSort); defaults
   * to DEFAULT_EQ_WATCHLIST_SORT ("chg"). */
  watchlistSort?: EqWatchlistSort;
  /** Seeds the blotter tab preference (useEqBlotterView); defaults to
   * DEFAULT_EQ_BLOTTER_VIEW ("orders"). */
  blotterView?: EqBlotterView;
}

/** The combined metric series for useMetrics(). */
export interface MetricsView {
  readonly throughput: readonly MetricSample[];
  readonly latency: readonly MetricSample[];
  readonly errorRate: readonly MetricSample[];
}

const DEFAULT_METRICS_VIEW: MetricsView = {
  throughput: [],
  latency: [],
  errorRate: [],
};

const INITIAL_INCIDENT_STATE: IncidentState = { active: [] };

/** Seed values for the ADMIN / telemetry hooks (Phase 5). */
export interface AdminSeed {
  topology?: ServiceTopology | null;
  eventLog?: readonly LogEvent[];
  sessions?: readonly SessionInfo[];
  metrics?: Partial<MetricsView>;
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
  acceptQuote: number[];
  passQuote: number[];
  quoteRfq: QuoteRequest[];
  /** Incremented each time useReconnect() callback is invoked. */
  reconnect: number;
  /** Incremented each time useSession().lock() is invoked. */
  sessionLock: number;
  /** Incremented each time useSession().unlock() (re-authenticate) is invoked. */
  sessionUnlock: number;
  /** Each value written through useAnimatedBackground().setEnabled/toggle, in order. */
  animatedBackgroundSets: boolean[];
  /** Each incident kind injected via injectIncident(), in order. */
  injectedIncidents: IncidentKind[];
}

/** The default throughput view a fresh World reports (loaded, value 100). */
const DEFAULT_THROUGHPUT: ThroughputView = {
  value: 100,
  loading: false,
  message: null,
};

/** The default session a fresh World reports: unlocked, static demo user. */
const DEFAULT_SESSION: SessionState = { locked: false, user: DEMO_USER };

export interface World {
  readonly sources: { [K in keyof HookValues]: BehaviorSubject<HookValues[K]> };
  /** Reactive throughput view backing useThroughput (drives AdminPanel). */
  readonly throughput: BehaviorSubject<ThroughputView>;
  /** Values captured from useThroughput().setValue calls. */
  readonly throughputSets: number[];
  /** Push a new throughput view (drives the AdminPanel's re-render). */
  setThroughputView(patch: Partial<ThroughputView>): void;
  /** Reactive theme-mode preference backing useThemePreference (drives ThemeProvider). */
  readonly themeMode: BehaviorSubject<ThemeModePreference>;
  /** Reactive theme-skin preference backing useThemeSkinPreference (drives ThemeProvider). */
  readonly themeSkin: BehaviorSubject<ThemeSkin>;
  /** Reactive animated-background preference backing useAnimatedBackground. */
  readonly animatedBackground: BehaviorSubject<boolean>;
  /** Reactive view-mode preference backing useViewModePreference (drives LiveRatesPanel). */
  readonly viewMode: BehaviorSubject<ViewMode>;
  /** Reactive session state backing useSession (drives LockScreen). */
  readonly session: BehaviorSubject<SessionState>;
  /** Per-key subject for usePrice(pair), keyed by pair.symbol. */
  priceFor(symbol: string): BehaviorSubject<Price | null>;
  /** Per-key subject for usePriceHistory(symbol). */
  historyFor(symbol: string): BehaviorSubject<readonly PriceTick[]>;
  /** Per-key subject for useQuotesForRfq(rfqId), keyed by rfqId. */
  quotesForRfq(rfqId: number): BehaviorSubject<readonly Quote[]>;
  /** Per-target subject for useAnimationIntents(target), keyed by target string. */
  intentFor(target: string): BehaviorSubject<AnimationIntent | null>;
  /** Push a new price for one symbol (drives that tile's re-render). */
  setPrice(symbol: string, value: Price | null): void;
  /** Push a new price history for one symbol. */
  setHistory(symbol: string, value: readonly PriceTick[]): void;
  /** Push new quotes for one RFQ (drives that card's re-render). */
  setQuotesForRfq(rfqId: number, value: readonly Quote[]): void;
  /** Push a new animation intent for one target (drives the AnimationProbe's re-render). */
  setIntent(target: string, intent: AnimationIntent | null): void;
  /** Reactive watchlist backing useWatchlist (drives WatchlistPanel/InstrumentTabs/SectorHeatmap). */
  readonly watchlist: BehaviorSubject<readonly EquityInstrument[]>;
  /** Reactive equity orders backing useEquityOrders (drives EqBlotterPanel/OrdersTable). */
  readonly equityOrders: BehaviorSubject<readonly EquityOrder[]>;
  /** Reactive equity positions backing useEquityPositions (drives EqBlotterPanel/PositionsTable). */
  readonly equityPositions: BehaviorSubject<readonly EquityPosition[]>;
  /** Lifecycle stream the OrderTicket's place() subscribes to; the page pushes EquityOrders here. */
  readonly orderLifecycle: Subject<EquityOrder>;
  /** Per-symbol subject for useEquityQuote(symbol). */
  equityQuoteFor(symbol: string): BehaviorSubject<EquityQuote | null>;
  /** Per-symbol subject for useCandles(symbol). */
  candlesFor(symbol: string): BehaviorSubject<readonly Candle[]>;
  /** Per-symbol subject for useDepth(symbol). */
  depthFor(symbol: string): BehaviorSubject<DepthBook | null>;
  /** Push a new watchlist (drives the watchlist-backed panels' re-render). */
  setWatchlist(value: readonly EquityInstrument[]): void;
  /** Push new equity orders (drives the OrdersTable's re-render). */
  setEquityOrders(value: readonly EquityOrder[]): void;
  /** Push new equity positions (drives the PositionsTable's re-render). */
  setEquityPositions(value: readonly EquityPosition[]): void;
  /** Push a new equity quote for one symbol. */
  setEquityQuote(symbol: string, value: EquityQuote | null): void;
  /** Push a new candle series for one symbol. */
  setCandles(symbol: string, value: readonly Candle[]): void;
  /** Push a new depth book for one symbol. */
  setDepth(symbol: string, value: DepthBook | null): void;
  /** Advance the OrderTicket lifecycle by emitting one EquityOrder into place(). */
  pushOrderLifecycle(order: EquityOrder): void;
  /** The REAL createEqWorkspaceMachine, one shared instance for the whole
   * World — mirrors the composition root's singleton wiring so every panel
   * reading useEqWorkspace() through this World observes the same selection/
   * open-tabs/timeframe state. */
  readonly eqWorkspace: Machine<EqWorkspaceState, EqWorkspaceIntents>;
  /** Reactive watchlist sort-mode preference backing useEqWatchlistSort. */
  readonly eqWatchlistSort: BehaviorSubject<EqWatchlistSort>;
  /** Reactive blotter tab preference backing useEqBlotterView. */
  readonly eqBlotterView: BehaviorSubject<EqBlotterView>;
  // Admin / telemetry streams (Phase 5)
  /** Reactive service topology backing useTopology. Null until first push. */
  readonly topology$: BehaviorSubject<ServiceTopology | null>;
  /** Reactive newest-first event log backing useEventLog. */
  readonly eventLog$: BehaviorSubject<readonly LogEvent[]>;
  /** Reactive active sessions backing useSessions. */
  readonly sessions$: BehaviorSubject<readonly SessionInfo[]>;
  /** Reactive metric series backing useMetrics (throughput/latency/errorRate). */
  readonly metrics$: BehaviorSubject<MetricsView>;
  /** Reactive incident state (active kinds) backing useIncident. */
  readonly incidentState$: BehaviorSubject<IncidentState>;
  /** Inject an incident: latencySpike/serviceDown also push DISCONNECTED;
   *  errorBurst is degraded-but-connected (mirrors IncidentMachine asymmetry). */
  injectIncident(kind: IncidentKind): void;
  /** Clear all active incidents and push CONNECTED. */
  clearIncident(): void;
  /** Push a new topology snapshot. */
  setTopology(value: ServiceTopology | null): void;
  /** Push a new event log (newest-first). */
  setEventLog(value: readonly LogEvent[]): void;
  /** Push new sessions. */
  setSessions(value: readonly SessionInfo[]): void;
  /** Patch the metric series (merges into current). */
  setMetrics(patch: Partial<MetricsView>): void;
  readonly results: CommandResults;
  readonly commands: CommandLog;
  /** Push new values for one or more NULLARY hooks (drives re-renders). */
  push(patch: Partial<HookValues>): void;
}

export function createWorld(
  initial: Partial<HookValues> = {},
  results: CommandResults = {},
  parametric: ParametricSeed = {},
  throughputSeed: Partial<ThroughputView> = {},
  themeModeSeed?: ThemeModePreference,
  viewModeSeed?: ViewMode,
  themeSkinSeed?: ThemeSkin,
  animatedBackgroundSeed?: boolean,
  sessionSeed: Partial<SessionState> = {},
  equitiesSeed: EquitiesSeed = {},
  adminSeed: AdminSeed = {},
): World {
  const merged: HookValues = { ...DEFAULTS, ...initial };
  const sources = {} as {
    [K in keyof HookValues]: BehaviorSubject<HookValues[K]>;
  };

  for (const key of Object.keys(merged) as (keyof HookValues)[]) {
    // Each subject is typed by its own key; the cast bridges the per-key union.
    (sources[key] as BehaviorSubject<unknown>) = new BehaviorSubject<unknown>(
      merged[key],
    );
  }

  const prices = new Map<string, BehaviorSubject<Price | null>>();
  const histories = new Map<string, BehaviorSubject<readonly PriceTick[]>>();
  const quotes = new Map<number, BehaviorSubject<readonly Quote[]>>();
  const intents = new Map<string, BehaviorSubject<AnimationIntent | null>>();

  function priceFor(symbol: string): BehaviorSubject<Price | null> {
    let subject = prices.get(symbol);

    if (!subject) {
      subject = new BehaviorSubject<Price | null>(null);
      prices.set(symbol, subject);
    }

    return subject;
  }

  function historyFor(symbol: string): BehaviorSubject<readonly PriceTick[]> {
    let subject = histories.get(symbol);

    if (!subject) {
      subject = new BehaviorSubject<readonly PriceTick[]>([]);
      histories.set(symbol, subject);
    }

    return subject;
  }

  function quotesForRfq(rfqId: number): BehaviorSubject<readonly Quote[]> {
    let subject = quotes.get(rfqId);

    if (!subject) {
      subject = new BehaviorSubject<readonly Quote[]>([]);
      quotes.set(rfqId, subject);
    }

    return subject;
  }

  function intentFor(target: string): BehaviorSubject<AnimationIntent | null> {
    let subject = intents.get(target);

    if (!subject) {
      subject = new BehaviorSubject<AnimationIntent | null>(null);
      intents.set(target, subject);
    }

    return subject;
  }

  for (const [symbol, value] of Object.entries(parametric.prices ?? {})) {
    priceFor(symbol).next(value);
  }

  for (const [symbol, value] of Object.entries(parametric.histories ?? {})) {
    historyFor(symbol).next(value);
  }

  for (const [rfqId, value] of Object.entries(parametric.quotesForRfq ?? {})) {
    quotesForRfq(Number(rfqId)).next(value);
  }

  // Equities: shared streams (watchlist/orders/positions) plus per-symbol
  // subjects (quotes/candles/depth) and a plain lifecycle Subject the OrderTicket
  // place() subscribes to.
  const watchlist = new BehaviorSubject<readonly EquityInstrument[]>(
    equitiesSeed.watchlist ?? [],
  );
  const equityOrders = new BehaviorSubject<readonly EquityOrder[]>(
    equitiesSeed.orders ?? [],
  );
  const equityPositions = new BehaviorSubject<readonly EquityPosition[]>(
    equitiesSeed.positions ?? [],
  );
  const orderLifecycle = new Subject<EquityOrder>();
  const eqWorkspace = createEqWorkspaceMachine({
    initialSymbol:
      equitiesSeed.initialSymbol ?? equitiesSeed.watchlist?.[0]?.symbol ?? "",
  });
  const eqWatchlistSort = new BehaviorSubject<EqWatchlistSort>(
    equitiesSeed.watchlistSort ?? DEFAULT_EQ_WATCHLIST_SORT,
  );
  const eqBlotterView = new BehaviorSubject<EqBlotterView>(
    equitiesSeed.blotterView ?? DEFAULT_EQ_BLOTTER_VIEW,
  );

  const equityQuotes = new Map<string, BehaviorSubject<EquityQuote | null>>();
  const candleSeries = new Map<string, BehaviorSubject<readonly Candle[]>>();
  const depthBooks = new Map<string, BehaviorSubject<DepthBook | null>>();

  function equityQuoteFor(symbol: string): BehaviorSubject<EquityQuote | null> {
    let subject = equityQuotes.get(symbol);

    if (!subject) {
      subject = new BehaviorSubject<EquityQuote | null>(null);
      equityQuotes.set(symbol, subject);
    }

    return subject;
  }

  function candlesFor(symbol: string): BehaviorSubject<readonly Candle[]> {
    let subject = candleSeries.get(symbol);

    if (!subject) {
      subject = new BehaviorSubject<readonly Candle[]>([]);
      candleSeries.set(symbol, subject);
    }

    return subject;
  }

  function depthFor(symbol: string): BehaviorSubject<DepthBook | null> {
    let subject = depthBooks.get(symbol);

    if (!subject) {
      subject = new BehaviorSubject<DepthBook | null>(null);
      depthBooks.set(symbol, subject);
    }

    return subject;
  }

  for (const [symbol, value] of Object.entries(equitiesSeed.quotes ?? {})) {
    equityQuoteFor(symbol).next(value);
  }

  for (const [symbol, value] of Object.entries(equitiesSeed.candles ?? {})) {
    candlesFor(symbol).next(value);
  }

  for (const [symbol, value] of Object.entries(equitiesSeed.depth ?? {})) {
    depthFor(symbol).next(value);
  }

  const throughput = new BehaviorSubject<ThroughputView>({
    ...DEFAULT_THROUGHPUT,
    ...throughputSeed,
  });
  const throughputSets: number[] = [];

  // Stateful display preferences: setters/toggle push back onto these subjects so
  // a click through the seam re-renders the consuming component (ThemeProvider /
  // LiveRatesPanel), mirroring the PreferencesPort's replay-current streams.
  const themeMode = new BehaviorSubject<ThemeModePreference>(
    themeModeSeed ?? DEFAULT_THEME_MODE_PREFERENCE,
  );
  // The harness pins the skin to "classic" by default (NOT the app's "holo"
  // showcase default): classic's tokens are byte-identical to the pre-redesign
  // single-axis tokens, so existing contract snapshots and deferred visual
  // goldens stay stable until Phase 3 regenerates them for the new skins.
  const themeSkin = new BehaviorSubject<ThemeSkin>(themeSkinSeed ?? "classic");
  const animatedBackground = new BehaviorSubject<boolean>(
    animatedBackgroundSeed ?? false,
  );
  const viewMode = new BehaviorSubject<ViewMode>(
    viewModeSeed ?? DEFAULT_VIEW_MODE,
  );
  const session = new BehaviorSubject<SessionState>({
    ...DEFAULT_SESSION,
    ...sessionSeed,
    user: { ...DEFAULT_SESSION.user, ...sessionSeed.user },
  });

  // Admin / telemetry subjects (Phase 5). Seeded from adminSeed; default to
  // null/empty so components render their "no data" placeholders before a spec
  // pushes live data — mirroring the app's start-before-first-emission state.
  const topology$ = new BehaviorSubject<ServiceTopology | null>(
    adminSeed.topology !== undefined ? adminSeed.topology : null,
  );
  const eventLog$ = new BehaviorSubject<readonly LogEvent[]>(
    adminSeed.eventLog ?? [],
  );
  const sessions$ = new BehaviorSubject<readonly SessionInfo[]>(
    adminSeed.sessions ?? [],
  );
  const metrics$ = new BehaviorSubject<MetricsView>({
    ...DEFAULT_METRICS_VIEW,
    ...adminSeed.metrics,
  });

  // Incident state tracks which kinds are currently active. Separate from the
  // connection-status subject so the IncidentControls' data-active attributes
  // re-render independently of the ConnectionOverlay.
  const incidentState$ = new BehaviorSubject<IncidentState>(
    INITIAL_INCIDENT_STATE,
  );

  // The disconnecting kinds mirror IncidentMachine's DISCONNECTING set.
  const DISCONNECTING_KINDS: ReadonlySet<IncidentKind> = new Set([
    "latencySpike",
    "serviceDown",
  ]);

  function injectIncident(kind: IncidentKind): void {
    commands.injectedIncidents.push(kind);
    // Update incident state to include this kind.
    const current = incidentState$.getValue();

    if (!current.active.includes(kind)) {
      incidentState$.next({ active: [...current.active, kind] });
    }

    // latencySpike and serviceDown break the gateway connection; errorBurst
    // is degraded-but-connected (the real asymmetry from IncidentMachine).
    if (DISCONNECTING_KINDS.has(kind)) {
      sources.useConnectionStatus.next(ConnectionStatus.DISCONNECTED);
    }
  }

  function clearIncident(): void {
    incidentState$.next(INITIAL_INCIDENT_STATE);
    sources.useConnectionStatus.next(ConnectionStatus.CONNECTED);
  }

  const commands: CommandLog = {
    createRfq: [],
    executeTrade: [],
    requestRfqQuote: [],
    acceptQuote: [],
    passQuote: [],
    quoteRfq: [],
    reconnect: 0,
    sessionLock: 0,
    sessionUnlock: 0,
    animatedBackgroundSets: [],
    injectedIncidents: [],
  };

  return {
    sources,
    throughput,
    throughputSets,
    setThroughputView: (patch: Partial<ThroughputView>) => {
      return throughput.next({ ...throughput.getValue(), ...patch });
    },
    themeMode,
    themeSkin,
    animatedBackground,
    viewMode,
    session,
    priceFor,
    historyFor,
    quotesForRfq,
    setPrice: (symbol: string, value: Price | null) => {
      return priceFor(symbol).next(value);
    },
    setHistory: (symbol: string, value: readonly PriceTick[]) => {
      return historyFor(symbol).next(value);
    },
    setQuotesForRfq: (rfqId: number, value: readonly Quote[]) => {
      return quotesForRfq(rfqId).next(value);
    },
    intentFor,
    setIntent: (target: string, intent: AnimationIntent | null) => {
      return intentFor(target).next(intent);
    },
    watchlist,
    equityOrders,
    equityPositions,
    orderLifecycle,
    equityQuoteFor,
    candlesFor,
    depthFor,
    setWatchlist: (value: readonly EquityInstrument[]) => {
      return watchlist.next(value);
    },
    setEquityOrders: (value: readonly EquityOrder[]) => {
      return equityOrders.next(value);
    },
    setEquityPositions: (value: readonly EquityPosition[]) => {
      return equityPositions.next(value);
    },
    setEquityQuote: (symbol: string, value: EquityQuote | null) => {
      return equityQuoteFor(symbol).next(value);
    },
    setCandles: (symbol: string, value: readonly Candle[]) => {
      return candlesFor(symbol).next(value);
    },
    setDepth: (symbol: string, value: DepthBook | null) => {
      return depthFor(symbol).next(value);
    },
    pushOrderLifecycle: (order: EquityOrder) => {
      return orderLifecycle.next(order);
    },
    eqWorkspace,
    eqWatchlistSort,
    eqBlotterView,
    // Admin subjects
    topology$,
    eventLog$,
    sessions$,
    metrics$,
    incidentState$,
    injectIncident,
    clearIncident,
    setTopology: (value: ServiceTopology | null) => {
      return topology$.next(value);
    },
    setEventLog: (value: readonly LogEvent[]) => {
      return eventLog$.next(value);
    },
    setSessions: (value: readonly SessionInfo[]) => {
      return sessions$.next(value);
    },
    setMetrics: (patch: Partial<MetricsView>) => {
      return metrics$.next({ ...metrics$.getValue(), ...patch });
    },
    results,
    commands,
    push(patch: Partial<HookValues>): void {
      for (const key of Object.keys(patch) as (keyof HookValues)[]) {
        (sources[key] as BehaviorSubject<unknown>).next(patch[key]);
      }
    },
  };
}
