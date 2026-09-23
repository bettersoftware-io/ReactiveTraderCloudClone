import { Context, Effect, Layer } from "effect";

import { firstWatchlistSymbol } from "@rtc/client-core";
import type {
  AmbientStylePresenter,
  AnalyticsPresenter,
  AnimatedBackgroundPresenter,
  AppPorts,
  BlotterPresenter,
  BootPreferencePresenter,
  CandleSeriesPresenter,
  ChartSubstratePresenter,
  ConnectionStatusPresenter,
  CreditRfqFilterPreferencePresenter,
  CurrencyPairsPresenter,
  DealersPresenter,
  DepthPresenter,
  EqBlotterViewPreferencePresenter,
  EqDrawingsIntents,
  EqDrawingsState,
  EqWatchlistSortPreferencePresenter,
  EqWorkspaceIntents,
  EqWorkspaceState,
  ErrorRatePresenter,
  EventLogPresenter,
  ForceBootAnimationPresenter,
  IncidentIntents,
  IncidentState,
  InstrumentsPresenter,
  JarvisPreferencesPresenter,
  LatencyPresenter,
  LayoutEnginePresenter,
  LoginWaitPreferencesPresenter,
  Machine,
  OrdersBlotterPresenter,
  PositionsPresenter,
  PowerSaverPresenter,
  Presenters,
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
} from "@rtc/core-api";

import { type EffectHost, pushIncidentEvent } from "#/bridge/out";
import { peek } from "#/bridge/peek";
import { createEqDrawingsMachine } from "#/machines/eqDrawings";
import { createEqWorkspaceMachine } from "#/machines/eqWorkspace";
import { createIncidentMachine } from "#/machines/incident";
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
import { AppPortsTag, HostLive, HostTag, presenterLayer } from "#/services";

// One tag per native presenter. The key is the member's name in
// `Presenters`, so a tag reads as the member it resolves to.
export const ConnectionTag = Context.GenericTag<ConnectionStatusPresenter>(
  "@rtc/client-core-effect/connection",
);
export const ThemePreferenceTag = Context.GenericTag<ThemePreferencePresenter>(
  "@rtc/client-core-effect/themePreference",
);
export const ThemeSkinPreferenceTag =
  Context.GenericTag<ThemeSkinPreferencePresenter>(
    "@rtc/client-core-effect/themeSkinPreference",
  );
export const ViewModePreferenceTag =
  Context.GenericTag<ViewModePreferencePresenter>(
    "@rtc/client-core-effect/viewModePreference",
  );
export const PowerSaverTag = Context.GenericTag<PowerSaverPresenter>(
  "@rtc/client-core-effect/powerSaver",
);
export const CreditRfqFilterPreferenceTag =
  Context.GenericTag<CreditRfqFilterPreferencePresenter>(
    "@rtc/client-core-effect/creditRfqFilterPreference",
  );
export const EqWatchlistSortPreferenceTag =
  Context.GenericTag<EqWatchlistSortPreferencePresenter>(
    "@rtc/client-core-effect/eqWatchlistSortPreference",
  );
export const EqBlotterViewPreferenceTag =
  Context.GenericTag<EqBlotterViewPreferencePresenter>(
    "@rtc/client-core-effect/eqBlotterViewPreference",
  );
export const BootPreferenceTag = Context.GenericTag<BootPreferencePresenter>(
  "@rtc/client-core-effect/bootPreference",
);
export const LoginWaitPreferencesTag =
  Context.GenericTag<LoginWaitPreferencesPresenter>(
    "@rtc/client-core-effect/loginWaitPreferences",
  );
export const JarvisPreferencesTag =
  Context.GenericTag<JarvisPreferencesPresenter>(
    "@rtc/client-core-effect/jarvisPreferences",
  );
export const AnimatedBackgroundTag =
  Context.GenericTag<AnimatedBackgroundPresenter>(
    "@rtc/client-core-effect/animatedBackground",
  );
export const AmbientStyleTag = Context.GenericTag<AmbientStylePresenter>(
  "@rtc/client-core-effect/ambientStyle",
);
export const ChartSubstrateTag = Context.GenericTag<ChartSubstratePresenter>(
  "@rtc/client-core-effect/chartSubstrate",
);
export const LayoutEngineTag = Context.GenericTag<LayoutEnginePresenter>(
  "@rtc/client-core-effect/layoutEngine",
);
export const ForceBootAnimationTag =
  Context.GenericTag<ForceBootAnimationPresenter>(
    "@rtc/client-core-effect/forceBootAnimation",
  );
export const PriceStreamTag = Context.GenericTag<PriceStreamPresenter>(
  "@rtc/client-core-effect/priceStream",
);
export const PriceHistoryTag = Context.GenericTag<PriceHistoryPresenter>(
  "@rtc/client-core-effect/priceHistory",
);
export const CurrencyPairsTag = Context.GenericTag<CurrencyPairsPresenter>(
  "@rtc/client-core-effect/currencyPairs",
);
export const BlotterTag = Context.GenericTag<BlotterPresenter>(
  "@rtc/client-core-effect/blotter",
);
export const AnalyticsTag = Context.GenericTag<AnalyticsPresenter>(
  "@rtc/client-core-effect/analytics",
);
export const ExecutionTag = Context.GenericTag<TradeExecutionPresenter>(
  "@rtc/client-core-effect/execution",
);
export const RfqsTag = Context.GenericTag<RfqsPresenter>(
  "@rtc/client-core-effect/rfqs",
);
export const DealersTag = Context.GenericTag<DealersPresenter>(
  "@rtc/client-core-effect/dealers",
);
export const InstrumentsTag = Context.GenericTag<InstrumentsPresenter>(
  "@rtc/client-core-effect/instruments",
);
export const RfqQuoteTag = Context.GenericTag<RfqQuotePresenter>(
  "@rtc/client-core-effect/rfqQuote",
);
export const WatchlistTag = Context.GenericTag<WatchlistPresenter>(
  "@rtc/client-core-effect/watchlist",
);
export const CandleSeriesTag = Context.GenericTag<CandleSeriesPresenter>(
  "@rtc/client-core-effect/candleSeries",
);
export const DepthTag = Context.GenericTag<DepthPresenter>(
  "@rtc/client-core-effect/depth",
);
export const OrdersBlotterTag = Context.GenericTag<OrdersBlotterPresenter>(
  "@rtc/client-core-effect/ordersBlotter",
);
export const PositionsTag = Context.GenericTag<PositionsPresenter>(
  "@rtc/client-core-effect/positions",
);
export const EqWorkspaceTag = Context.GenericTag<
  Machine<EqWorkspaceState, EqWorkspaceIntents>
>("@rtc/client-core-effect/eqWorkspace");
export const EqDrawingsTag = Context.GenericTag<
  Machine<EqDrawingsState, EqDrawingsIntents>
>("@rtc/client-core-effect/eqDrawings");
const ThroughputTag = Context.GenericTag<ThroughputPresenter>(
  "@rtc/client-core-effect/throughput",
);
const ThroughputMetricTag =
  Context.GenericTag<ThroughputMetricPresenter>(
    "@rtc/client-core-effect/throughputMetric",
  );
const LatencyMetricTag = Context.GenericTag<LatencyPresenter>(
  "@rtc/client-core-effect/latencyMetric",
);
const ErrorRateMetricTag = Context.GenericTag<ErrorRatePresenter>(
  "@rtc/client-core-effect/errorRateMetric",
);
const TopologyTag = Context.GenericTag<ServiceTopologyPresenter>(
  "@rtc/client-core-effect/topology",
);
const EventLogTag = Context.GenericTag<EventLogPresenter>(
  "@rtc/client-core-effect/eventLog",
);
const SessionsTag = Context.GenericTag<SessionsPresenter>(
  "@rtc/client-core-effect/sessions",
);
const SessionsKpiTag = Context.GenericTag<SessionsKpiPresenter>(
  "@rtc/client-core-effect/sessionsKpi",
);
const IncidentTag = Context.GenericTag<
  Machine<IncidentState, IncidentIntents>
>("@rtc/client-core-effect/incident");

/** Every native service the app layer provides — the identifier of each
 * `GenericTag` is its service type. */
export type NativeServices =
  | ConnectionStatusPresenter
  | ThemePreferencePresenter
  | ThemeSkinPreferencePresenter
  | ViewModePreferencePresenter
  | PowerSaverPresenter
  | CreditRfqFilterPreferencePresenter
  | EqWatchlistSortPreferencePresenter
  | EqBlotterViewPreferencePresenter
  | BootPreferencePresenter
  | LoginWaitPreferencesPresenter
  | JarvisPreferencesPresenter
  | AnimatedBackgroundPresenter
  | AmbientStylePresenter
  | ChartSubstratePresenter
  | LayoutEnginePresenter
  | ForceBootAnimationPresenter
  | PriceStreamPresenter
  | PriceHistoryPresenter
  | CurrencyPairsPresenter
  | BlotterPresenter
  | AnalyticsPresenter
  | TradeExecutionPresenter
  | RfqsPresenter
  | DealersPresenter
  | InstrumentsPresenter
  | RfqQuotePresenter
  | WatchlistPresenter
  | CandleSeriesPresenter
  | DepthPresenter
  | OrdersBlotterPresenter
  | PositionsPresenter
  | Machine<EqWorkspaceState, EqWorkspaceIntents>
  | Machine<EqDrawingsState, EqDrawingsIntents>
  | ThroughputPresenter
  | ThroughputMetricPresenter
  | LatencyPresenter
  | ErrorRatePresenter
  | ServiceTopologyPresenter
  | EventLogPresenter
  | SessionsPresenter
  | SessionsKpiPresenter
  | Machine<IncidentState, IncidentIntents>;

// Presenters that need only the host and the ports.
const ConnectionLive = presenterLayer(ConnectionTag, (host, ports) => {
  return createConnectionPresenter(host, ports.connectionEvents);
});

const ThemePreferenceLive = presenterLayer(
  ThemePreferenceTag,
  (host, ports) => {
    return createThemePreferencePresenter(
      host,
      ports.preferences,
      ports.colorScheme,
    );
  },
);

const ThemeSkinPreferenceLive = presenterLayer(
  ThemeSkinPreferenceTag,
  (host, ports) => {
    return createThemeSkinPreferencePresenter(host, ports.preferences);
  },
);

const ViewModePreferenceLive = presenterLayer(
  ViewModePreferenceTag,
  (host, ports) => {
    return createViewModePreferencePresenter(host, ports.preferences);
  },
);

const PowerSaverLive = presenterLayer(PowerSaverTag, (host, ports) => {
  return createPowerSaverPresenter(host, ports.preferences);
});

const CreditRfqFilterPreferenceLive = presenterLayer(
  CreditRfqFilterPreferenceTag,
  (host, ports) => {
    return createCreditRfqFilterPreferencePresenter(host, ports.preferences);
  },
);

const EqWatchlistSortPreferenceLive = presenterLayer(
  EqWatchlistSortPreferenceTag,
  (host, ports) => {
    return createEqWatchlistSortPreferencePresenter(host, ports.preferences);
  },
);

const EqBlotterViewPreferenceLive = presenterLayer(
  EqBlotterViewPreferenceTag,
  (host, ports) => {
    return createEqBlotterViewPreferencePresenter(host, ports.preferences);
  },
);

const BootPreferenceLive = presenterLayer(BootPreferenceTag, (_host, ports) => {
  return createBootPreferencePresenter(ports.preferences);
});

const LoginWaitPreferencesLive = presenterLayer(
  LoginWaitPreferencesTag,
  (host, ports) => {
    return createLoginWaitPreferencesPresenter(host, ports.preferences);
  },
);

const JarvisPreferencesLive = presenterLayer(
  JarvisPreferencesTag,
  (host, ports) => {
    return createJarvisPreferencesPresenter(host, ports.preferences);
  },
);

const AnimatedBackgroundLive = presenterLayer(
  AnimatedBackgroundTag,
  (host, ports) => {
    return createAnimatedBackgroundPresenter(host, ports.preferences);
  },
);

const AmbientStyleLive = presenterLayer(AmbientStyleTag, (host, ports) => {
  return createAmbientStylePresenter(host, ports.preferences);
});

const ChartSubstrateLive = presenterLayer(ChartSubstrateTag, (host, ports) => {
  return createChartSubstratePresenter(host, ports.preferences);
});

const LayoutEngineLive = presenterLayer(LayoutEngineTag, (host, ports) => {
  return createLayoutEnginePresenter(host, ports.preferences);
});

const ForceBootAnimationLive = presenterLayer(
  ForceBootAnimationTag,
  (host, ports) => {
    return createForceBootAnimationPresenter(host, ports.preferences);
  },
);

const CurrencyPairsLive = presenterLayer(CurrencyPairsTag, (host, ports) => {
  return createCurrencyPairsPresenter(host, ports.referenceData);
});

const BlotterLive = presenterLayer(BlotterTag, (host, ports) => {
  return createBlotterPresenter(host, ports.blotter);
});

const AnalyticsLive = presenterLayer(AnalyticsTag, (host, ports) => {
  return createAnalyticsPresenter(host, ports.analytics);
});

const ExecutionLive = presenterLayer(ExecutionTag, (host, ports) => {
  return createTradeExecutionPresenter(host, ports.execution);
});

const RfqsLive = presenterLayer(RfqsTag, (host, ports) => {
  return createRfqsPresenter(host, ports.workflow);
});

const DealersLive = presenterLayer(DealersTag, (host, ports) => {
  return createDealersPresenter(host, ports.dealers);
});

const InstrumentsLive = presenterLayer(InstrumentsTag, (host, ports) => {
  return createInstrumentsPresenter(host, ports.instruments);
});

const RfqQuoteLive = presenterLayer(RfqQuoteTag, (host, ports) => {
  return createRfqQuotePresenter(host, ports.pricing);
});

const WatchlistLive = presenterLayer(WatchlistTag, (host, ports) => {
  return createWatchlistPresenter(host, ports.marketData);
});

const CandleSeriesLive = presenterLayer(CandleSeriesTag, (host, ports) => {
  return createCandleSeriesPresenter(host, ports.marketData);
});

const DepthLive = presenterLayer(DepthTag, (host, ports) => {
  return createDepthPresenter(host, ports.marketData);
});

const OrdersBlotterLive = presenterLayer(OrdersBlotterTag, (host, ports) => {
  return createOrdersBlotterPresenter(host, ports.orders);
});

const PositionsLive = presenterLayer(PositionsTag, (host, ports) => {
  return createPositionsPresenter(host, ports.positions);
});

// Slice 5: the admin nine. The metric windows, eventLog and sessionsKpi are
// retained folds, topology and sessions retained mirrors; incident is an
// app-lifetime singleton whose connection events reach the RxJS core's
// `incident$` seam.
const ThroughputLive = presenterLayer(ThroughputTag, (host, ports) => {
  return createThroughputPresenter(host, ports.admin);
});

const ThroughputMetricLive = presenterLayer(
  ThroughputMetricTag,
  (host, ports) => {
    return createMetricWindowPresenter(host, ports.telemetry.throughput$());
  },
);

const LatencyMetricLive = presenterLayer(LatencyMetricTag, (host, ports) => {
  return createMetricWindowPresenter(host, ports.telemetry.latency$());
});

const ErrorRateMetricLive = presenterLayer(
  ErrorRateMetricTag,
  (host, ports) => {
    return createMetricWindowPresenter(host, ports.telemetry.errorRate$());
  },
);

const TopologyLive = presenterLayer(TopologyTag, (host, ports) => {
  return createTopologyPresenter(host, ports.serviceHealth);
});

const EventLogLive = presenterLayer(EventLogTag, (host, ports) => {
  return createEventLogPresenter(host, ports.eventLog);
});

const SessionsLive = presenterLayer(SessionsTag, (host, ports) => {
  return createSessionsPresenter(host, ports.sessions);
});

const SessionsKpiLive = presenterLayer(SessionsKpiTag, (host, ports) => {
  return createSessionsKpiPresenter(host, ports.sessions);
});

const IncidentLive = presenterLayer(IncidentTag, (host, ports) => {
  return createIncidentMachine(host, {
    controls: ports.metricControls,
    pushConnectionEvent: pushIncidentEvent,
  });
});

// The one native machine that needs nothing but the host — `ports` is
// deliberately unused.
const EqDrawingsLive = presenterLayer(EqDrawingsTag, (host) => {
  return createEqDrawingsMachine(host);
});

// The two presenters that depend on ANOTHER native presenter — the reason
// this slice introduces the Layer graph: `priceStream` and `priceHistory`
// gate their conflation on `powerSaver.isCalm$`.
const PriceStreamLive: Layer.Layer<
  PriceStreamPresenter,
  never,
  EffectHost | AppPorts | PowerSaverPresenter
> = Layer.effect(
  PriceStreamTag,
  Effect.gen(function* buildPriceStream() {
    const host = yield* HostTag;
    const ports = yield* AppPortsTag;
    const powerSaver = yield* PowerSaverTag;
    return createPriceStreamPresenter(host, ports.pricing, powerSaver.isCalm$);
  }),
);

const PriceHistoryLive: Layer.Layer<
  PriceHistoryPresenter,
  never,
  EffectHost | AppPorts | PowerSaverPresenter
> = Layer.effect(
  PriceHistoryTag,
  Effect.gen(function* buildPriceHistory() {
    const host = yield* HostTag;
    const ports = yield* AppPortsTag;
    const powerSaver = yield* PowerSaverTag;
    return createPriceHistoryPresenter(host, ports.pricing, powerSaver.isCalm$);
  }),
);

const EqWorkspaceLive: Layer.Layer<
  Machine<EqWorkspaceState, EqWorkspaceIntents>,
  never,
  EffectHost | WatchlistPresenter
> = Layer.effect(
  EqWorkspaceTag,
  Effect.gen(function* buildEqWorkspace() {
    const host = yield* HostTag;
    const watchlist = yield* WatchlistTag;
    return createEqWorkspaceMachine(host, {
      initialSymbol: firstWatchlistSymbol(peek(watchlist.watchlist$, [])),
      watchlist$: watchlist.watchlist$,
    });
  }),
);

/** What the app layer hands out: every native presenter, plus the two
 * services they were built from. The base is `provideMerge`d rather than
 * `provide`d because `composeWithBase` needs `HostTag` out of the same
 * build — the host scope is what `app.dispose()` closes, and a `provide`
 * would satisfy the presenters' requirement while hiding the very service
 * the teardown owns. */
export type AppLayerServices = NativeServices | EffectHost | AppPorts;

/** The whole native app as one Layer over the ports. `PowerSaverLive` and
 * `WatchlistLive` are each both merged into the app and provided to the
 * dependents: a Layer is memoised by reference within one build, so each is
 * constructed ONCE and `presenters.powerSaver` IS the instance `priceStream`
 * gates on, `presenters.watchlist` IS the instance `eqWorkspace` seeds from
 * (`layers.test.ts` pins both). */
export function buildAppLayer(ports: AppPorts): Layer.Layer<AppLayerServices> {
  const base = Layer.merge(HostLive, Layer.succeed(AppPortsTag, ports));
  const independent = Layer.mergeAll(
    ConnectionLive,
    ThemePreferenceLive,
    ThemeSkinPreferenceLive,
    ViewModePreferenceLive,
    PowerSaverLive,
    CreditRfqFilterPreferenceLive,
    EqWatchlistSortPreferenceLive,
    EqBlotterViewPreferenceLive,
    BootPreferenceLive,
    LoginWaitPreferencesLive,
    JarvisPreferencesLive,
    AnimatedBackgroundLive,
    AmbientStyleLive,
    ChartSubstrateLive,
    LayoutEngineLive,
    ForceBootAnimationLive,
    CurrencyPairsLive,
    BlotterLive,
    AnalyticsLive,
    ExecutionLive,
    RfqsLive,
    DealersLive,
    InstrumentsLive,
    RfqQuoteLive,
    WatchlistLive,
    CandleSeriesLive,
    DepthLive,
    OrdersBlotterLive,
    PositionsLive,
    EqDrawingsLive,
    ThroughputLive,
    ThroughputMetricLive,
    LatencyMetricLive,
    ErrorRateMetricLive,
    TopologyLive,
    EventLogLive,
    SessionsLive,
    SessionsKpiLive,
    IncidentLive,
  );

  const dependent = Layer.mergeAll(
    PriceStreamLive,
    PriceHistoryLive,
    EqWorkspaceLive,
  ).pipe(Layer.provide(Layer.merge(PowerSaverLive, WatchlistLive)));
  return Layer.merge(independent, dependent).pipe(Layer.provideMerge(base));
}

/** The native overlay's type: `Partial<Presenters>`, except for the
 * members whose streams `composeWithBase` must hand the RxJS base as
 * `CoreSeams` — those are typed present, so a seam needs no non-null
 * assertion. */
export type NativePresenters = Partial<Presenters> &
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
  >;

/** Resolve every tag into the `Presenters` overlay — the ONE `runSync`
 * `composeWithBase` makes. */
export const nativePresentersEffect: Effect.Effect<
  NativePresenters,
  never,
  NativeServices
> = Effect.all({
  connection: ConnectionTag,
  themePreference: ThemePreferenceTag,
  themeSkinPreference: ThemeSkinPreferenceTag,
  viewModePreference: ViewModePreferenceTag,
  powerSaver: PowerSaverTag,
  creditRfqFilterPreference: CreditRfqFilterPreferenceTag,
  eqWatchlistSortPreference: EqWatchlistSortPreferenceTag,
  eqBlotterViewPreference: EqBlotterViewPreferenceTag,
  bootPreference: BootPreferenceTag,
  loginWaitPreferences: LoginWaitPreferencesTag,
  jarvisPreferences: JarvisPreferencesTag,
  animatedBackground: AnimatedBackgroundTag,
  ambientStyle: AmbientStyleTag,
  chartSubstrate: ChartSubstrateTag,
  layoutEngine: LayoutEngineTag,
  forceBootAnimation: ForceBootAnimationTag,
  priceStream: PriceStreamTag,
  priceHistory: PriceHistoryTag,
  currencyPairs: CurrencyPairsTag,
  blotter: BlotterTag,
  analytics: AnalyticsTag,
  execution: ExecutionTag,
  rfqs: RfqsTag,
  dealers: DealersTag,
  instruments: InstrumentsTag,
  rfqQuote: RfqQuoteTag,
  watchlist: WatchlistTag,
  candleSeries: CandleSeriesTag,
  depth: DepthTag,
  ordersBlotter: OrdersBlotterTag,
  positions: PositionsTag,
  eqWorkspace: EqWorkspaceTag,
  eqDrawings: EqDrawingsTag,
  throughput: ThroughputTag,
  throughputMetric: ThroughputMetricTag,
  latencyMetric: LatencyMetricTag,
  errorRateMetric: ErrorRateMetricTag,
  topology: TopologyTag,
  eventLog: EventLogTag,
  sessions: SessionsTag,
  sessionsKpi: SessionsKpiTag,
  incident: IncidentTag,
});
