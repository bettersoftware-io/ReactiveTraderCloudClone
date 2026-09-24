import {
  type CoreSeams,
  createAuthDeps,
  createApp as createRxjsApp,
  createMachineFactories as createRxjsMachineFactories,
  firstWatchlistSymbol,
  type JarvisEvent,
  type WorkspaceSeam,
} from "@rtc/client-core";
import type {
  App,
  AppPorts,
  CoreFactory,
  MachineFactories,
  Presenters,
  RfqCountdownSeed,
  Stream,
  WorkspaceTab,
} from "@rtc/core-api";
import type {
  BootVariant,
  CurrencyPair,
  ExecuteTradeInput,
  PlaceOrderRequest,
} from "@rtc/domain";

import { peek } from "#/bridge/in";
import { pushIncidentEvent } from "#/bridge/out";
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
import {
  createNativeWorkspace,
  type NativeWorkspace,
} from "#/presenters/workspace";

/** What `composeWithBase` hands back: the RxJS app it delegated to, and the
 * app this core presents. `parity.test.ts` compares the two member by
 * member. */
export interface ComposedApp {
  base: App;
  app: App;
}

/** The machine-factory twin of `ComposedApp`. */
export interface ComposedMachines {
  base: MachineFactories;
  machines: MachineFactories;
}

/** `nativePresenters`' return type: every native member is present, PLUS
 * the members whose streams `composeWithBase` hands to the base RxJS app as
 * `CoreSeams` — typed narrow rather than a non-null assertion at the call
 * site. */
type NativePresenters = Partial<Presenters> &
  Pick<
    Presenters,
    | "connection"
    | "currencyPairs"
    | "eqWorkspace"
    | "execution"
    | "ordersBlotter"
    | "priceStream"
    | "rfqs"
    | "watchlist"
    | "workspaceNav"
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
 * the `incident` singleton, whose connection events still land on the RxJS
 * core's `incident$` seam (`pushIncidentEvent`). Everything else
 * still delegates to the RxJS core. `parity.json` is the committed record
 * of the same fact and `parity.test.ts` proves the two agree by
 * reference. */
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
    auth: createAuthPresenter(createAuthDeps(ports), lifetime),
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
        pushConnectionEvent: pushIncidentEvent,
      },
      lifetime,
    ),
  };
}

export function composeWithBase(ports: AppPorts): ComposedApp {
  const lifetime = new AbortController();
  // Native FIRST (see `CoreSeams`): every internal reader of the base app —
  // its Jarvis driver, animation director, narrator and workspace seed — is
  // pointed at this core's own members. Without that a drive batch would
  // mutate a workspace the UI no longer renders, a fill or an FX execution
  // made through a NATIVE presenter would choreograph nothing, and each
  // port those readers share with a native member would be held twice.
  const native = nativePresenters(ports, lifetime.signal);
  // Filled by the `workspace` seam factory below, inside `createRxjsApp` —
  // an array, not a `let`, so the type does not narrow to `null` across the
  // closure's assignment.
  const builtWorkspaces: NativeWorkspace[] = [];
  const seams: CoreSeams = {
    eqWorkspace: native.eqWorkspace,
    equityFills$: native.ordersBlotter.fills$,
    watchlist$: native.watchlist.watchlist$,
    pairs$: native.currencyPairs.pairs$,
    priceFor: (pair: CurrencyPair) => {
      return native.priceStream.price$(pair);
    },
    executions$: native.execution.executions$,
    rfqEvents$: native.rfqs.events$,
    connectionStatus$: native.connection.status$,
    workspaceNav: native.workspaceNav,
    // The native workspace needs the base's (still delegated) Jarvis events
    // and the base's Jarvis driver needs the native workspace: `createApp`
    // calls this factory right after building `jarvis` (slice 7, wave 1).
    workspace: (jarvisEvents$: Stream<JarvisEvent>): WorkspaceSeam => {
      const workspace = createNativeWorkspace(
        { ports, jarvisEvents$, workspaceNav: native.workspaceNav },
        lifetime.signal,
      );
      builtWorkspaces.push(workspace);
      return workspace.seam;
    },
  };
  const base = createRxjsApp(ports, seams);
  const [nativeWorkspace] = builtWorkspaces;

  if (nativeWorkspace === undefined) {
    throw new Error("createApp never called the workspace seam");
  }

  const app: App = {
    ...base,
    presenters: {
      ...base.presenters,
      ...native,
      ...nativeWorkspace.presenters,
    },
    commands: createCommands(nativeWorkspace.reportDetachedPanels),
    // General rule (see docs/architecture/22-pluggable-application-core.md
    // §22 "Teardown order"): an alternative core releases its own resources
    // first, then the base app it delegates to. Here that means aborting
    // the retained singletons' `lifetime` before `base.dispose()` — their
    // relays may still be draining streams the base app owns. Idempotent: a
    // second abort is a no-op, and the base's dispose is its own concern.
    dispose: async () => {
      lifetime.abort();
      await base.dispose();
    },
  };
  return { base, app };
}

export function createApp(ports: AppPorts): App {
  return composeWithBase(ports).app;
}

/** The machine half of the same fact, and the same overlay seam. It has to
 * be an overlay rather than a bare `return createRxjsMachineFactories(...)`:
 * that builder mints fresh closures on every call, so two calls of it share
 * no identity at all and the manifest's `delegated` claim would be
 * unfalsifiable. Spreading ONE base keeps the delegated members reference-
 * identical to it, so `parity.test.ts` can tell native from delegated.
 *
 * The native factories close over the SAME merged `presenters` the RxJS
 * builder gets — `staleFlag` reads `priceStream.price$(pair)` and
 * `analyticsStaleFlag` reads `analytics.position$`, both native above;
 * `tileExecution` reaches `execution.execute`; `rfqTile` reaches
 * `rfqQuote.requestQuote`, and `rfqSubmission`/`ticketSubmission` ARE the
 * per-mount machines `rfqs` mints (the RxJS builder's own wiring), so the
 * commands they run are that presenter's. */
function nativeMachines(presenters: Presenters): Partial<MachineFactories> {
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

export function composeMachinesWithBase(
  presenters: Presenters,
): ComposedMachines {
  const base = createRxjsMachineFactories(presenters);
  return { base, machines: { ...base, ...nativeMachines(presenters) } };
}

export function createMachineFactories(
  presenters: Presenters,
): MachineFactories {
  return composeMachinesWithBase(presenters).machines;
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
