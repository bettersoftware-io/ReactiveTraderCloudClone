import { Context, Effect, Layer } from "effect";

import type {
  AmbientStylePresenter,
  AnalyticsPresenter,
  AnimatedBackgroundPresenter,
  AppPorts,
  BlotterPresenter,
  BootPreferencePresenter,
  ChartSubstratePresenter,
  ConnectionStatusPresenter,
  CreditRfqFilterPreferencePresenter,
  CurrencyPairsPresenter,
  DealersPresenter,
  EqBlotterViewPreferencePresenter,
  EqWatchlistSortPreferencePresenter,
  ForceBootAnimationPresenter,
  InstrumentsPresenter,
  JarvisPreferencesPresenter,
  LayoutEnginePresenter,
  LoginWaitPreferencesPresenter,
  PowerSaverPresenter,
  Presenters,
  PriceHistoryPresenter,
  PriceStreamPresenter,
  RfqQuotePresenter,
  RfqsPresenter,
  ThemePreferencePresenter,
  ThemeSkinPreferencePresenter,
  TradeExecutionPresenter,
  ViewModePreferencePresenter,
} from "@rtc/core-api";

import type { EffectHost } from "#/bridge/out";
import { createBlotterPresenter } from "#/presenters/blotter";
import { createConnectionPresenter } from "#/presenters/connection";
import { createTradeExecutionPresenter } from "#/presenters/execution";
import {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
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
import {
  createAnalyticsPresenter,
  createCurrencyPairsPresenter,
  createDealersPresenter,
  createInstrumentsPresenter,
} from "#/presenters/warmSingletons";
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
  | RfqQuotePresenter;

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

/** What the app layer hands out: every native presenter, plus the two
 * services they were built from. The base is `provideMerge`d rather than
 * `provide`d because `composeWithBase` needs `HostTag` out of the same
 * build — the host scope is what `app.dispose()` closes, and a `provide`
 * would satisfy the presenters' requirement while hiding the very service
 * the teardown owns. */
export type AppLayerServices = NativeServices | EffectHost | AppPorts;

/** The whole native app as one Layer over the ports. `PowerSaverLive` is
 * both merged into the app and provided to the two dependents: a Layer is
 * memoised by reference within one build, so it is constructed ONCE and
 * `presenters.powerSaver` IS the instance `priceStream` gates on
 * (`layers.test.ts` pins that). */
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
  );

  const dependent = Layer.mergeAll(PriceStreamLive, PriceHistoryLive).pipe(
    Layer.provide(PowerSaverLive),
  );
  return Layer.merge(independent, dependent).pipe(Layer.provideMerge(base));
}

/** Resolve every tag into the `Presenters` overlay — the ONE `runSync`
 * `composeWithBase` makes. */
export const nativePresentersEffect: Effect.Effect<
  Partial<Presenters>,
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
});
