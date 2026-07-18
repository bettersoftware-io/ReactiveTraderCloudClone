import { type Observable, of, Subject } from "rxjs";
import { filter, map, take } from "rxjs/operators";

import type {
  BootVariant,
  ConnectionEvent,
  CurrencyPair,
  EquityInstrument,
  ExecuteTradeInput,
} from "@rtc/domain";

import type { IWsAdapter } from "#/adapters/IWsAdapter";
import type { AppPorts } from "#/adapters/portFactory";
import {
  createDefaultLayoutPort,
  type WorkspaceTab,
} from "#/layout/defaultLayoutPort";
import {
  AnalyticsPresenter,
  AnimatedBackgroundPresenter,
  ForceBootAnimationPresenter,
  AnimationDirector,
  AuthPresenter,
  BlotterPresenter,
  BootGatePresenter,
  BootPreferencePresenter,
  CandleSeriesPresenter,
  ConnectionStatusPresenter,
  CreditRfqFilterPreferencePresenter,
  CurrencyPairsPresenter,
  createBootSequenceMachine,
  createEqWorkspaceMachine,
  createIncidentMachine,
  createLayoutMachine,
  createNotionalMachine,
  createOrderTicketMachine,
  createRfqTileMachine,
  createRowHighlightMachine,
  createStaleFlagMachine,
  createTileExecutionMachine,
  DealersPresenter,
  DepthPresenter,
  EqBlotterViewPreferencePresenter,
  EqWatchlistSortPreferencePresenter,
  type EqWorkspaceIntents,
  type EqWorkspaceState,
  ErrorRatePresenter,
  EventLogPresenter,
  type IncidentIntents,
  type IncidentState,
  InstrumentsPresenter,
  LatencyPresenter,
  type Machine,
  type MachineFactories,
  OrdersBlotterPresenter,
  PositionsPresenter,
  PowerSaverPresenter,
  PriceHistoryPresenter,
  PriceStreamPresenter,
  RfqQuotePresenter,
  RfqsPresenter,
  ServiceTopologyPresenter,
  SessionsKpiPresenter,
  SessionsPresenter,
  ThemePreferencePresenter,
  ThemeSkinPreferencePresenter,
  ThroughputMetricPresenter,
  ThroughputPresenter,
  TradeExecutionPresenter,
  ViewModePreferencePresenter,
  WatchlistPresenter,
} from "#/presenters/index";

export type { AppPorts };

/** The reconnect-intent event emitted from the Reconnect button. */
interface ReconnectIntent {
  type: "reconnect";
}

/** Routes idle-lifecycle events to the WS adapter. Exported so the wiring is
 * directly testable (idleTeardown.test.ts).
 * - idleTimeout  → closeForIdle() (suppresses auto-reconnect)
 * - reconnect    → reopen()       (sole recovery from idle; button-only)
 * - userActivity → no-op here     (resets countdown in BrowserConnectionEventsAdapter
 *                                   only; does NOT reopen the socket)
 * Provenance: original services/connection.ts:74-96. */
export function routeIdleLifecycle(
  event: ConnectionEvent,
  ws: Pick<IWsAdapter, "closeForIdle" | "reopen">,
): void {
  if (event.type === "idleTimeout") {
    ws.closeForIdle();
  } else if (event.type === "reconnect") {
    ws.reopen();
  }
}

export interface Presenters {
  priceStream: PriceStreamPresenter;
  priceHistory: PriceHistoryPresenter;
  execution: TradeExecutionPresenter;
  blotter: BlotterPresenter;
  analytics: AnalyticsPresenter;
  rfqs: RfqsPresenter;
  currencyPairs: CurrencyPairsPresenter;
  instruments: InstrumentsPresenter;
  dealers: DealersPresenter;
  connection: ConnectionStatusPresenter;
  rfqQuote: RfqQuotePresenter;
  throughput: ThroughputPresenter;
  themePreference: ThemePreferencePresenter;
  themeSkinPreference: ThemeSkinPreferencePresenter;
  animatedBackground: AnimatedBackgroundPresenter;
  forceBootAnimation: ForceBootAnimationPresenter;
  powerSaver: PowerSaverPresenter;
  viewModePreference: ViewModePreferencePresenter;
  creditRfqFilterPreference: CreditRfqFilterPreferencePresenter;
  /** Equities watchlist sort-mode preference (the head's ⇅ cycle control). */
  eqWatchlistSortPreference: EqWatchlistSortPreferencePresenter;
  /** Equities blotter tab preference (Orders/Positions), consumed by Task 5. */
  eqBlotterViewPreference: EqBlotterViewPreferencePresenter;
  animationDirector: AnimationDirector;
  bootPreference: BootPreferencePresenter;
  /** Boot-splash overlay visibility + the account menu's ⟳ Reboot HUD intent. */
  bootGate: BootGatePresenter;
  auth: AuthPresenter;
  watchlist: WatchlistPresenter;
  candleSeries: CandleSeriesPresenter;
  depth: DepthPresenter;
  ordersBlotter: OrdersBlotterPresenter;
  positions: PositionsPresenter;
  /** Phase 5 Admin: incident injection + connection-seam control. */
  incident: Machine<IncidentState, IncidentIntents>;
  /** Equities: cross-panel selected-symbol / open-tabs / timeframe state,
   * shared by the chart, instrument-tabs, and watchlist panels. */
  eqWorkspace: Machine<EqWorkspaceState, EqWorkspaceIntents>;
  /** Phase 5 Admin: per-metric rolling window series for charts. */
  throughputMetric: ThroughputMetricPresenter;
  latencyMetric: LatencyPresenter;
  errorRateMetric: ErrorRatePresenter;
  /** Phase 5 Admin: service-topology graph stream. */
  topology: ServiceTopologyPresenter;
  /** Phase 5 Admin: newest-first rolling event log. */
  eventLog: EventLogPresenter;
  /** Phase 5 Admin: active trader sessions feed. */
  sessions: SessionsPresenter;
  /** Plan E Admin: rolling session-count series for the "Active Sessions" KPI card. */
  sessionsKpi: SessionsKpiPresenter;
}

export interface AppCommands {
  /** Push a user-initiated reconnect intent (wired to reconnect$ in composition). */
  reconnect(): void;
}

export interface App {
  presenters: Presenters;
  ports: AppPorts;
  commands: AppCommands;
}

/**
 * Phase-0 shared seam — owned by the neutral core.
 * User-initiated reconnect intent Subject. Owned in composition so both the
 * real-WS and simulator branches can merge it, and the hook factory can push
 * into it via AppCommands.reconnect().
 * `buildBrowserPorts` (client-react) imports and merges these into connectionEvents.
 */
export const reconnect$ = new Subject<ReconnectIntent>();

/**
 * Phase-0 shared seam — owned by the neutral core.
 * Incident-machine connection-event sink. Plain Subject — a live sink for
 * inject() calls. Owned at module level alongside reconnect$.
 * `buildBrowserPorts` (client-react) imports and merges these into connectionEvents.
 */
export const incident$ = new Subject<ConnectionEvent>();

/** One-shot synchronous peek at the watchlist's first symbol, used only to
 * seed EqWorkspaceMachine's initial tab/selection at composition time. The
 * simulator port's `watchlist()` is `of(WATCHLIST)` — it emits synchronously,
 * so this reliably captures "AAPL" (or whatever heads the catalogue) before
 * `createApp` returns. A real WS backend's `watchlist()` arrives over the
 * wire (not synchronously) — this peek then finds nothing and falls back to
 * "", the same empty-selection state the eq-* dock panels' own
 * `instruments[0]?.symbol ?? ""` guards tolerate before the watchlist has
 * loaded. The peek subscribes and
 * immediately unsubscribes; `watchlist$`'s `shareReplay({refCount: true})`
 * tears down and restarts cleanly for whichever component subscribes next. */
function peekFirstWatchlistSymbol(
  watchlist$: Observable<readonly EquityInstrument[]>,
): string {
  let first = "";
  const sub = watchlist$.subscribe((list) => {
    if (first === "" && list.length > 0) {
      first = list[0]?.symbol ?? "";
    }
  });
  sub.unsubscribe();
  return first;
}

/** Async companion to {@link peekFirstWatchlistSymbol}: resolves the SAME
 * first-watchlist-symbol, but as an Observable that waits for it to actually
 * arrive instead of only checking what's already buffered. Passed to
 * EqWorkspaceMachine as `seed$` so a WS-real backend (whose watchlist() lands
 * over the wire, not synchronously) can recover from the peek's "" fallback:
 * once the watchlist's first non-empty list arrives, this emits its first
 * symbol exactly once and completes. A no-op when the sync peek already
 * found a symbol — the machine only applies a seed while sel is still "". */
export function firstWatchlistSymbol$(
  watchlist$: Observable<readonly EquityInstrument[]>,
): Observable<string> {
  return watchlist$.pipe(
    map((list) => {
      return list[0]?.symbol ?? "";
    }),
    filter((symbol) => {
      return symbol !== "";
    }),
    take(1),
  );
}

export function createApp(ports: AppPorts): App {
  // Hoisted so the AnimationDirector can wire its connectionStatus$ source from
  // the same connection presenter instance the rest of the app consumes.
  const connection = new ConnectionStatusPresenter(ports.connectionEvents);
  // Hoisted so priceStream/priceHistory can gate their conflation behind the
  // same power-saver flag stream the record also exposes as `powerSaver`.
  const powerSaver = new PowerSaverPresenter(ports.preferences);
  // Hoisted so the AnimationDirector can consume their streams directly.
  const priceStream = new PriceStreamPresenter(
    ports.pricing,
    powerSaver.isCalm$,
  );
  const execution = new TradeExecutionPresenter(ports.execution);
  const rfqs = new RfqsPresenter(ports.workflow);
  const currencyPairs = new CurrencyPairsPresenter(ports.referenceData);
  // Hoisted so the AnimationDirector can consume its fills$ stream for ticket
  // fill-flash choreography (Phase 4 equities).
  const ordersBlotter = new OrdersBlotterPresenter(ports.orders);
  // Hoisted so eqWorkspace can seed its initial selection from the first
  // watchlist symbol (see peekFirstWatchlistSymbol below).
  const watchlist = new WatchlistPresenter(ports.marketData);

  // Fall back to a light-always scheme when no OS color-scheme source is provided
  // (tests, simulator, environments without matchMedia).
  const colorScheme = ports.colorScheme ?? {
    prefersDark$: (): Observable<boolean> => {
      return of(false);
    },
  };

  const presenters: Presenters = {
    priceStream,
    priceHistory: new PriceHistoryPresenter(ports.pricing, powerSaver.isCalm$),
    execution,
    blotter: new BlotterPresenter(ports.blotter),
    analytics: new AnalyticsPresenter(ports.analytics),
    rfqs,
    currencyPairs,
    instruments: new InstrumentsPresenter(ports.instruments),
    dealers: new DealersPresenter(ports.dealers),
    connection,
    rfqQuote: new RfqQuotePresenter(ports.pricing),
    throughput: new ThroughputPresenter(ports.admin),
    themePreference: new ThemePreferencePresenter(
      ports.preferences,
      colorScheme,
    ),
    themeSkinPreference: new ThemeSkinPreferencePresenter(ports.preferences),
    animatedBackground: new AnimatedBackgroundPresenter(ports.preferences),
    forceBootAnimation: new ForceBootAnimationPresenter(ports.preferences),
    powerSaver,
    viewModePreference: new ViewModePreferencePresenter(ports.preferences),
    creditRfqFilterPreference: new CreditRfqFilterPreferencePresenter(
      ports.preferences,
    ),
    eqWatchlistSortPreference: new EqWatchlistSortPreferencePresenter(
      ports.preferences,
    ),
    eqBlotterViewPreference: new EqBlotterViewPreferencePresenter(
      ports.preferences,
    ),
    animationDirector: new AnimationDirector({
      pairs$: currencyPairs.pairs$,
      priceFor: (pair: CurrencyPair) => {
        return priceStream.price$(pair);
      },
      connectionStatus$: connection.status$,
      executions$: execution.executions$,
      rfqEvents$: rfqs.events$,
      equityFills$: ordersBlotter.fills$,
    }),
    bootPreference: new BootPreferencePresenter(ports.preferences),
    // Boot-splash visibility, seeded once from the platform's boot-splash
    // decision (defaults to playing when no bootSplash port is supplied).
    bootGate: new BootGatePresenter(ports.bootSplash?.shouldPlay() ?? true),
    // Login/lock/logout lifecycle over the injected AuthPort + SessionStore.
    auth: new AuthPresenter(ports.auth, ports.sessionStore),
    watchlist,
    candleSeries: new CandleSeriesPresenter(ports.marketData),
    depth: new DepthPresenter(ports.marketData),
    ordersBlotter,
    positions: new PositionsPresenter(ports.positions),
    incident: createIncidentMachine({
      controls: ports.metricControls,
      pushConnectionEvent: (ev: ConnectionEvent) => {
        return incident$.next(ev);
      },
    }),
    eqWorkspace: createEqWorkspaceMachine({
      initialSymbol: peekFirstWatchlistSymbol(watchlist.watchlist$),
      seed$: firstWatchlistSymbol$(watchlist.watchlist$),
    }),
    throughputMetric: new ThroughputMetricPresenter(ports.telemetry),
    latencyMetric: new LatencyPresenter(ports.telemetry),
    errorRateMetric: new ErrorRatePresenter(ports.telemetry),
    topology: new ServiceTopologyPresenter(ports.serviceHealth),
    eventLog: new EventLogPresenter(ports.eventLog),
    sessions: new SessionsPresenter(ports.sessions),
    sessionsKpi: new SessionsKpiPresenter(ports.sessions),
  };

  const commands: AppCommands = {
    reconnect: () => {
      reconnect$.next({ type: "reconnect" });
    },
  };
  return { presenters, ports, commands };
}

/** Build the app-layer machine factories the ViewModel seam injects. Each factory
 * spins up a fresh machine per component mount, wired to the presenters. */
export function createMachineFactories(
  presenters: Presenters,
): MachineFactories {
  return {
    tileExecution: (pair: CurrencyPair) => {
      return createTileExecutionMachine(pair, {
        execute: (input: ExecuteTradeInput) => {
          return presenters.execution.execute(input);
        },
      });
    },
    rfqTile: (pair: CurrencyPair) => {
      return createRfqTileMachine(pair, {
        requestQuote: (symbol: string, pipsPosition: number) => {
          return presenters.rfqQuote.requestQuote(symbol, pipsPosition);
        },
      });
    },
    staleFlag: (pair: CurrencyPair) => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.priceStream.price$(pair),
      });
    },
    analyticsStaleFlag: () => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.analytics.position$,
      });
    },
    rowHighlight: (isNew: boolean) => {
      return createRowHighlightMachine(isNew);
    },
    notional: (defaultNotional: number) => {
      return createNotionalMachine(defaultNotional);
    },
    rfqSubmission: () => {
      return presenters.rfqs.createSubmission();
    },
    ticketSubmission: () => {
      return presenters.rfqs.createTicketSubmission();
    },
    layout: (tab: WorkspaceTab) => {
      return createLayoutMachine(createDefaultLayoutPort(tab));
    },
    boot: (onDone: () => void) => {
      return createBootSequenceMachine({
        variant: presenters.bootPreference.current(),
        advance: (next: BootVariant): void => {
          presenters.bootPreference.setVariant(next);
        },
        onDone,
      });
    },
    orderTicket: (defaultSymbol: string) => {
      return createOrderTicketMachine({
        place: (req: Parameters<typeof presenters.ordersBlotter.place>[0]) => {
          return presenters.ordersBlotter.place(req);
        },
        defaultSymbol,
      });
    },
  };
}
