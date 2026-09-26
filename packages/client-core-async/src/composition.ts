import type {
  App,
  AppPorts,
  CoreFactory,
  MachineFactories,
  Presenters,
  RfqCountdownSeed,
  WorkspaceTab,
} from "@rtc/core-api";
import { createAuthDeps, firstWatchlistSymbol } from "@rtc/core-logic";
import type {
  BootVariant,
  ConnectionEvent,
  CurrencyPair,
  ExecuteTradeInput,
  PlaceOrderRequest,
} from "@rtc/domain";

import { authDepsPrimitives } from "#/bridge/authDepsPrimitives";
import { peek } from "#/bridge/in";
import { gateTransportOnAuth } from "#/bridge/transportGate";
import { createCommands } from "#/commands";
import { createBootMachine } from "#/machines/boot";
import { createEqDrawingsMachine } from "#/machines/eqDrawings";
import { createEqWorkspaceMachine } from "#/machines/eqWorkspace";
import { createIncidentMachine } from "#/machines/incident";
import { createNotionalMachine } from "#/machines/notional";
import { createOrderTicketMachine } from "#/machines/orderTicket";
import { createRfqCountdownMachine } from "#/machines/rfqCountdown";
import { createRfqTileMachine } from "#/machines/rfqTile";
import { createRowHighlightMachine } from "#/machines/rowHighlight";
import { createStaleFlagMachine } from "#/machines/staleFlag";
import { createTileExecutionMachine } from "#/machines/tileExecution";
import { createWorkspaceNavMachine } from "#/machines/workspaceNav";
import {
  createEventLogPresenter,
  createMetricWindowPresenter,
  createSessionsKpiPresenter,
  createSessionsPresenter,
  createTopologyPresenter,
} from "#/presenters/admin";
import { createBlotterPresenter } from "#/presenters/blotter";
import { createCandleSeriesPresenter } from "#/presenters/candleSeries";
import { createConnectionPresenter } from "#/presenters/connection";
import { createDepthPresenter } from "#/presenters/depth";
import { createTradeExecutionPresenter } from "#/presenters/execution";
import {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
import { createJarvisFamily } from "#/presenters/jarvisFamily";
import { createOrdersBlotterPresenter } from "#/presenters/ordersBlotter";
import {
  createAmbientStylePresenter,
  createAnimatedBackgroundPresenter,
  createChartSubstratePresenter,
  createCreditRfqFilterPreferencePresenter,
  createEqBlotterViewPreferencePresenter,
  createForceBootAnimationPresenter,
  createLayoutEnginePresenter,
  createPowerSaverPresenter,
  createThemeSkinPreferencePresenter,
  createViewModePreferencePresenter,
} from "#/presenters/preferences";
import { createPriceHistoryPresenter } from "#/presenters/priceHistory";
import { createPriceStreamPresenter } from "#/presenters/priceStream";
import {
  createBootPreferencePresenter,
  createEqWatchlistSortPreferencePresenter,
} from "#/presenters/readPreferences";
import { createRfqQuotePresenter } from "#/presenters/rfqQuote";
import { createRfqsPresenter } from "#/presenters/rfqs";
import {
  createAnimationDirector,
  createAuthPresenter,
  createBootGatePresenter,
} from "#/presenters/shell";
import { createThemePreferencePresenter } from "#/presenters/themePreference";
import { createThroughputPresenter } from "#/presenters/throughput";
import {
  createAnalyticsPresenter,
  createCurrencyPairsPresenter,
  createDealersPresenter,
  createInstrumentsPresenter,
  createPositionsPresenter,
} from "#/presenters/warmSingletons";
import { createWatchlistPresenter } from "#/presenters/watchlist";

/** `nativePresenters`' return type: every member but the ones the Jarvis
 * family and its workspace supply (`createJarvisFamily`). Exact, not
 * `Partial`, so the typecheck proves the two halves cover `Presenters`. */
type NativePresenters = Omit<
  Presenters,
  | "dismissPanel"
  | "dockedPanelIdsFor"
  | "dockLayoutStore"
  | "dockPanel"
  | "jarvis"
  | "jarvisDemo"
  | "jarvisDriver"
  | "jarvisPanels"
  | "jarvisUsage"
  | "layoutFor"
  | "layoutPresets"
  | "resetWorkspaceLayout"
  | "undockPanel"
  | "workspaceLayoutResets$"
>;

/** Members this core implements natively — slice 1a: the connection fold,
 * the four theme/view/power-saver preferences, and `commands` (see
 * `createCommands`); slice 1b: the eleven remaining preference presenters;
 * slice 2: the six FX pricing/blotter/execution presenters, of which the
 * four warm singletons (`currencyPairs`, `blotter`'s `trades$`/`activity$`,
 * `analytics`) hold their port subscriptions until `lifetime` aborts;
 * slice 3: the four credit presenters, of which `rfqs`, `dealers` and
 * `instruments` hold their port subscriptions until `lifetime` aborts;
 * slice 4: the five equities presenters — `watchlist`, `orders$` and
 * `positions` retained — and the two workspace singletons; slice 5: the
 * admin nine — the three metric windows, `eventLog` and `sessionsKpi` as
 * warm folds, `topology` and `sessions` as warm mirrors, `throughput`, and
 * the `incident` singleton, whose connection events go out through
 * `ports.connectionIntents.injectIncident`; slice 6: the five shell members.
 * Everything else — the workspace and the Jarvis family — comes from
 * `createJarvisFamily` (slice 7). */
function nativePresenters(
  ports: AppPorts,
  lifetime: AbortSignal,
): NativePresenters {
  const { preferences } = ports;
  // Hoisted: `priceStream` and `priceHistory` gate their conflation on it —
  // the RxJS core's order.
  const powerSaver = createPowerSaverPresenter(preferences);
  const connection = createConnectionPresenter(ports.connectionEvents);
  const priceStream = createPriceStreamPresenter(
    ports.pricing,
    powerSaver.isCalm$,
  );

  const currencyPairs = createCurrencyPairsPresenter(
    ports.referenceData,
    lifetime,
  );
  const execution = createTradeExecutionPresenter(ports.execution);
  const rfqs = createRfqsPresenter(ports.workflow, lifetime);
  const watchlist = createWatchlistPresenter(ports.marketData, lifetime);
  const ordersBlotter = createOrdersBlotterPresenter(ports.orders, lifetime);
  const eqWorkspace = createEqWorkspaceMachine(
    {
      initialSymbol: firstWatchlistSymbol(peek(watchlist.watchlist$, [])),
      watchlist$: watchlist.watchlist$,
    },
    lifetime,
  );

  return {
    connection,
    themePreference: createThemePreferencePresenter(
      preferences,
      ports.colorScheme,
    ),
    themeSkinPreference: createThemeSkinPreferencePresenter(preferences),
    viewModePreference: createViewModePreferencePresenter(preferences),
    powerSaver,
    creditRfqFilterPreference:
      createCreditRfqFilterPreferencePresenter(preferences),
    eqWatchlistSortPreference:
      createEqWatchlistSortPreferencePresenter(preferences),
    eqBlotterViewPreference:
      createEqBlotterViewPreferencePresenter(preferences),
    bootPreference: createBootPreferencePresenter(preferences),
    loginWaitPreferences: createLoginWaitPreferencesPresenter(preferences),
    jarvisPreferences: createJarvisPreferencesPresenter(preferences),
    animatedBackground: createAnimatedBackgroundPresenter(preferences),
    ambientStyle: createAmbientStylePresenter(preferences),
    chartSubstrate: createChartSubstratePresenter(preferences),
    layoutEngine: createLayoutEnginePresenter(preferences),
    forceBootAnimation: createForceBootAnimationPresenter(preferences),
    priceStream,
    priceHistory: createPriceHistoryPresenter(
      ports.pricing,
      powerSaver.isCalm$,
    ),
    currencyPairs,
    blotter: createBlotterPresenter(ports.blotter, lifetime),
    analytics: createAnalyticsPresenter(ports.analytics, lifetime),
    execution,
    rfqs,
    dealers: createDealersPresenter(ports.dealers, lifetime),
    instruments: createInstrumentsPresenter(ports.instruments, lifetime),
    rfqQuote: createRfqQuotePresenter(ports.pricing),
    watchlist,
    candleSeries: createCandleSeriesPresenter(ports.marketData, lifetime),
    depth: createDepthPresenter(ports.marketData),
    ordersBlotter,
    positions: createPositionsPresenter(ports.positions, lifetime),
    eqWorkspace,
    eqDrawings: createEqDrawingsMachine(lifetime),
    workspaceNav: createWorkspaceNavMachine(lifetime),
    bootGate: createBootGatePresenter(ports.bootSplash?.shouldPlay() ?? true),
    auth: createAuthPresenter(
      createAuthDeps(ports, authDepsPrimitives),
      lifetime,
    ),
    animationDirector: createAnimationDirector({
      pairs$: currencyPairs.pairs$,
      priceFor: (pair: CurrencyPair) => {
        return priceStream.price$(pair);
      },
      connectionStatus$: connection.status$,
      executions$: execution.executions$,
      rfqEvents$: rfqs.events$,
      equityFills$: ordersBlotter.fills$,
    }),
    throughput: createThroughputPresenter(ports.admin, lifetime),
    throughputMetric: createMetricWindowPresenter(
      ports.telemetry.throughput$(),
      lifetime,
    ),
    latencyMetric: createMetricWindowPresenter(
      ports.telemetry.latency$(),
      lifetime,
    ),
    errorRateMetric: createMetricWindowPresenter(
      ports.telemetry.errorRate$(),
      lifetime,
    ),
    topology: createTopologyPresenter(ports.serviceHealth, lifetime),
    eventLog: createEventLogPresenter(ports.eventLog, lifetime),
    sessions: createSessionsPresenter(ports.sessions, lifetime),
    sessionsKpi: createSessionsKpiPresenter(ports.sessions, lifetime),
    incident: createIncidentMachine(
      {
        controls: ports.metricControls,
        pushConnectionEvent: (event: ConnectionEvent): void => {
          ports.connectionIntents.injectIncident(event);
        },
      },
      lifetime,
    ),
  };
}

/** This core's `App`, built only from its own members: the native
 * presenters, then the Jarvis family and its workspace (jarvis first, the
 * workspace over its own events, then the driver, demo, narrator, history
 * source and usage). `App.presenters: Presenters` makes the typecheck the
 * completeness witness — every member is this core's. The transport is gated
 * on this core's own `auth`. */
export function createApp(ports: AppPorts): App {
  const lifetime = new AbortController();
  const native = nativePresenters(ports, lifetime.signal);
  const family = createJarvisFamily(
    {
      ports,
      workspaceNav: native.workspaceNav,
      eqWorkspace: native.eqWorkspace,
      watchlist$: native.watchlist.watchlist$,
      themeSkinPreference: native.themeSkinPreference,
      powerSaver: native.powerSaver,
      jarvisPreferences: native.jarvisPreferences,
      pairs$: native.currencyPairs.pairs$,
      priceFor: (pair: CurrencyPair) => {
        return native.priceStream.price$(pair);
      },
    },
    lifetime.signal,
  );
  gateTransportOnAuth(ports.transport, native.auth.state$, lifetime.signal);

  return {
    presenters: {
      ...native,
      ...family.workspace.presenters,
      jarvis: family.jarvis,
      jarvisDriver: family.jarvisDriver,
      jarvisDemo: family.jarvisDemo,
      jarvisUsage: family.jarvisUsage,
    },
    ports,
    commands: createCommands(
      ports.connectionIntents,
      family.workspace.reportDetachedPanels,
    ),
    // Idempotent: a second abort is a no-op. The Jarvis presenter is
    // disposed first — its in-flight turn may still be draining a relay
    // `lifetime` owns.
    dispose: async () => {
      family.jarvis.dispose();
      lifetime.abort();
    },
  };
}

/** This core's machine factories. They close over the `presenters` they are
 * given — `staleFlag` reads `priceStream.price$(pair)` and
 * `analyticsStaleFlag` reads `analytics.position$`, both native above;
 * `tileExecution` reaches `execution.execute`; `rfqTile` reaches
 * `rfqQuote.requestQuote`, and `rfqSubmission`/`ticketSubmission` ARE the
 * per-mount machines `rfqs` mints (the RxJS builder's own wiring), so the
 * commands they run are that presenter's. */
function nativeMachines(presenters: Presenters): MachineFactories {
  return {
    tileExecution: (pair: CurrencyPair) => {
      return createTileExecutionMachine(pair, {
        execute: (input: ExecuteTradeInput) => {
          return presenters.execution.execute(input);
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
    rfqTile: (pair: CurrencyPair) => {
      return createRfqTileMachine(pair, {
        requestQuote: (symbol: string, pipsPosition: number) => {
          return presenters.rfqQuote.requestQuote(symbol, pipsPosition);
        },
      });
    },
    rfqSubmission: () => {
      return presenters.rfqs.createSubmission();
    },
    ticketSubmission: () => {
      return presenters.rfqs.createTicketSubmission();
    },
    rfqCountdown: (seed: RfqCountdownSeed) => {
      return createRfqCountdownMachine(seed);
    },
    boot: (onDone: () => void) => {
      return createBootMachine({
        variant: presenters.bootPreference.current(),
        advance: (next: BootVariant) => {
          presenters.bootPreference.setVariant(next);
        },
        onDone,
      });
    },
    layout: (tab: WorkspaceTab) => {
      return presenters.layoutFor(tab);
    },
    orderTicket: (defaultSymbol: string) => {
      return createOrderTicketMachine({
        place: (req: PlaceOrderRequest) => {
          return presenters.ordersBlotter.place(req);
        },
        defaultSymbol,
      });
    },
  };
}

export function createMachineFactories(
  presenters: Presenters,
): MachineFactories {
  return nativeMachines(presenters);
}

/** Survives minification as a literal; `check:core-bundle` greps for it to
 * prove a build that did not select this core did not ship it. */
export const ASYNC_CORE_BRAND = "@rtc/client-core-async:brand";

/** A `CoreFactory` that also carries the grep-able brand literal above, so
 * `check:core-bundle` has something to look for. */
export interface BrandedCoreFactory extends CoreFactory {
  readonly brand: string;
}

export const asyncCore: BrandedCoreFactory = {
  brand: ASYNC_CORE_BRAND,
  createApp,
  createMachineFactories,
};
