import { type Observable, of, Subject } from "rxjs";

import type {
  BootVariant,
  ConnectionEvent,
  CurrencyPair,
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
  AnimationDirector,
  BlotterPresenter,
  BootPreferencePresenter,
  CandleSeriesPresenter,
  ConnectionStatusPresenter,
  CreditRfqFilterPreferencePresenter,
  CurrencyPairsPresenter,
  createBootSequenceMachine,
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
  PriceHistoryPresenter,
  PriceStreamPresenter,
  RfqQuotePresenter,
  RfqsPresenter,
  ServiceTopologyPresenter,
  SessionPresenter,
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
  if (event.type === "idleTimeout") ws.closeForIdle();
  else if (event.type === "reconnect") ws.reopen();
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
  viewModePreference: ViewModePreferencePresenter;
  creditRfqFilterPreference: CreditRfqFilterPreferencePresenter;
  animationDirector: AnimationDirector;
  bootPreference: BootPreferencePresenter;
  session: SessionPresenter;
  watchlist: WatchlistPresenter;
  candleSeries: CandleSeriesPresenter;
  depth: DepthPresenter;
  ordersBlotter: OrdersBlotterPresenter;
  positions: PositionsPresenter;
  /** Phase 5 Admin: incident injection + connection-seam control. */
  incident: Machine<IncidentState, IncidentIntents>;
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

export function createApp(ports: AppPorts): App {
  // Hoisted so the AnimationDirector can wire its connectionStatus$ source from
  // the same connection presenter instance the rest of the app consumes.
  const connection = new ConnectionStatusPresenter(ports.connectionEvents);
  // Hoisted so the AnimationDirector can consume their streams directly.
  const priceStream = new PriceStreamPresenter(ports.pricing);
  const execution = new TradeExecutionPresenter(ports.execution);
  const rfqs = new RfqsPresenter(ports.workflow);
  const currencyPairs = new CurrencyPairsPresenter(ports.referenceData);
  // Hoisted so the AnimationDirector can consume its fills$ stream for ticket
  // fill-flash choreography (Phase 4 equities).
  const ordersBlotter = new OrdersBlotterPresenter(ports.orders);

  // Fall back to a light-always scheme when no OS color-scheme source is provided
  // (tests, simulator, environments without matchMedia).
  const colorScheme = ports.colorScheme ?? {
    prefersDark$: (): Observable<boolean> => {
      return of(false);
    },
  };

  const presenters: Presenters = {
    priceStream,
    priceHistory: new PriceHistoryPresenter(ports.pricing),
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
    viewModePreference: new ViewModePreferencePresenter(ports.preferences),
    creditRfqFilterPreference: new CreditRfqFilterPreferencePresenter(
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
    // Session lock/unlock state over the static demo user (no real auth backend).
    session: new SessionPresenter(),
    watchlist: new WatchlistPresenter(ports.marketData),
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
    throughputMetric: new ThroughputMetricPresenter(ports.telemetry),
    latencyMetric: new LatencyPresenter(ports.telemetry),
    errorRateMetric: new ErrorRatePresenter(ports.telemetry),
    topology: new ServiceTopologyPresenter(ports.serviceHealth),
    eventLog: new EventLogPresenter(ports.eventLog),
    sessions: new SessionsPresenter(ports.sessions),
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
