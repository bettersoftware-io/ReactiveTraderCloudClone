import { describe, expectTypeOf, it } from "vitest";

import type {
  AmbientStylePresenter as AmbientStylePresenterApi,
  AnalyticsPresenter as AnalyticsPresenterApi,
  AnimatedBackgroundPresenter as AnimatedBackgroundPresenterApi,
  AnimationDirector as AnimationDirectorApi,
  AuthPresenter as AuthPresenterApi,
  BlotterPresenter as BlotterPresenterApi,
  BootGatePresenter as BootGatePresenterApi,
  BootPreferencePresenter as BootPreferencePresenterApi,
  CandleSeriesPresenter as CandleSeriesPresenterApi,
  ChartSubstratePresenter as ChartSubstratePresenterApi,
  ConnectionStatusPresenter as ConnectionStatusPresenterApi,
  CreditRfqFilterPreferencePresenter as CreditRfqFilterPreferencePresenterApi,
  CurrencyPairsPresenter as CurrencyPairsPresenterApi,
  DealersPresenter as DealersPresenterApi,
  DepthPresenter as DepthPresenterApi,
  EqBlotterViewPreferencePresenter as EqBlotterViewPreferencePresenterApi,
  EqWatchlistSortPreferencePresenter as EqWatchlistSortPreferencePresenterApi,
  ErrorRatePresenter as ErrorRatePresenterApi,
  EventLogPresenter as EventLogPresenterApi,
  ForceBootAnimationPresenter as ForceBootAnimationPresenterApi,
  InstrumentsPresenter as InstrumentsPresenterApi,
  JarvisPanelsPresenter as JarvisPanelsPresenterApi,
  JarvisPreferencesPresenter as JarvisPreferencesPresenterApi,
  JarvisUsagePresenter as JarvisUsagePresenterApi,
  LatencyPresenter as LatencyPresenterApi,
  LayoutEnginePresenter as LayoutEnginePresenterApi,
  LoginWaitPreferencesPresenter as LoginWaitPreferencesPresenterApi,
  OrdersBlotterPresenter as OrdersBlotterPresenterApi,
  PositionsPresenter as PositionsPresenterApi,
  PowerSaverPresenter as PowerSaverPresenterApi,
  PriceHistoryPresenter as PriceHistoryPresenterApi,
  PriceStreamPresenter as PriceStreamPresenterApi,
  RfqQuotePresenter as RfqQuotePresenterApi,
  RfqsPresenter as RfqsPresenterApi,
  ServiceTopologyPresenter as ServiceTopologyPresenterApi,
  SessionsKpiPresenter as SessionsKpiPresenterApi,
  SessionsPresenter as SessionsPresenterApi,
  ThemePreferencePresenter as ThemePreferencePresenterApi,
  ThemeSkinPreferencePresenter as ThemeSkinPreferencePresenterApi,
  ThroughputMetricPresenter as ThroughputMetricPresenterApi,
  ThroughputPresenter as ThroughputPresenterApi,
  TradeExecutionPresenter as TradeExecutionPresenterApi,
  ViewModePreferencePresenter as ViewModePreferencePresenterApi,
  WatchlistPresenter as WatchlistPresenterApi,
} from "@rtc/core-api";

import type { AmbientStylePresenter } from "../AmbientStylePresenter";
import type { AnalyticsPresenter } from "../AnalyticsPresenter";
import type { AnimatedBackgroundPresenter } from "../AnimatedBackgroundPresenter";
import type { AnimationDirector } from "../AnimationDirector";
import type { AuthPresenter } from "../AuthPresenter";
import type { BlotterPresenter } from "../BlotterPresenter";
import type { BootGatePresenter } from "../BootGatePresenter";
import type { BootPreferencePresenter } from "../BootPreferencePresenter";
import type { CandleSeriesPresenter } from "../CandleSeriesPresenter";
import type { ChartSubstratePresenter } from "../ChartSubstratePresenter";
import type { ConnectionStatusPresenter } from "../ConnectionStatusPresenter";
import type { CreditRfqFilterPreferencePresenter } from "../CreditRfqFilterPreferencePresenter";
import type { CurrencyPairsPresenter } from "../CurrencyPairsPresenter";
import type { DealersPresenter } from "../DealersPresenter";
import type { DepthPresenter } from "../DepthPresenter";
import type { EqBlotterViewPreferencePresenter } from "../EqBlotterViewPreferencePresenter";
import type { EqWatchlistSortPreferencePresenter } from "../EqWatchlistSortPreferencePresenter";
import type { ErrorRatePresenter } from "../ErrorRatePresenter";
import type { EventLogPresenter } from "../EventLogPresenter";
import type { ForceBootAnimationPresenter } from "../ForceBootAnimationPresenter";
import type { InstrumentsPresenter } from "../InstrumentsPresenter";
import type { JarvisPanelsPresenter } from "../JarvisPanelsPresenter";
import type { JarvisPreferencesPresenter } from "../JarvisPreferencesPresenter";
import type { JarvisUsagePresenter } from "../JarvisUsagePresenter";
import type { LatencyPresenter } from "../LatencyPresenter";
import type { LayoutEnginePresenter } from "../LayoutEnginePresenter";
import type { LoginWaitPreferencesPresenter } from "../LoginWaitPreferencesPresenter";
import type { OrdersBlotterPresenter } from "../OrdersBlotterPresenter";
import type { PositionsPresenter } from "../PositionsPresenter";
import type { PowerSaverPresenter } from "../PowerSaverPresenter";
import type { PriceHistoryPresenter } from "../PriceHistoryPresenter";
import type { PriceStreamPresenter } from "../PriceStreamPresenter";
import type { RfqQuotePresenter } from "../RfqQuotePresenter";
import type { RfqsPresenter } from "../RfqsPresenter";
import type { ServiceTopologyPresenter } from "../ServiceTopologyPresenter";
import type { SessionsKpiPresenter } from "../SessionsKpiPresenter";
import type { SessionsPresenter } from "../SessionsPresenter";
import type { ThemePreferencePresenter } from "../ThemePreferencePresenter";
import type { ThemeSkinPreferencePresenter } from "../ThemeSkinPreferencePresenter";
import type { ThroughputMetricPresenter } from "../ThroughputMetricPresenter";
import type { ThroughputPresenter } from "../ThroughputPresenter";
import type { TradeExecutionPresenter } from "../TradeExecutionPresenter";
import type { ViewModePreferencePresenter } from "../ViewModePreferencePresenter";
import type { WatchlistPresenter } from "../WatchlistPresenter";

/** The proof that every RxJS presenter class in this package satisfies its
 * `@rtc/core-api` interface. A future core's implementer copies this file,
 * repoints the relative imports at their own classes, and gets the same
 * compile-time guarantee. */
describe("RxJS presenters satisfy the core-api interfaces", () => {
  it("public surfaces match", () => {
    expectTypeOf<AmbientStylePresenter>().toMatchTypeOf<AmbientStylePresenterApi>();
    expectTypeOf<AnalyticsPresenter>().toMatchTypeOf<AnalyticsPresenterApi>();
    expectTypeOf<AnimatedBackgroundPresenter>().toMatchTypeOf<AnimatedBackgroundPresenterApi>();
    expectTypeOf<AnimationDirector>().toMatchTypeOf<AnimationDirectorApi>();
    expectTypeOf<AuthPresenter>().toMatchTypeOf<AuthPresenterApi>();
    expectTypeOf<BlotterPresenter>().toMatchTypeOf<BlotterPresenterApi>();
    expectTypeOf<BootGatePresenter>().toMatchTypeOf<BootGatePresenterApi>();
    expectTypeOf<BootPreferencePresenter>().toMatchTypeOf<BootPreferencePresenterApi>();
    expectTypeOf<CandleSeriesPresenter>().toMatchTypeOf<CandleSeriesPresenterApi>();
    expectTypeOf<ChartSubstratePresenter>().toMatchTypeOf<ChartSubstratePresenterApi>();
    expectTypeOf<ConnectionStatusPresenter>().toMatchTypeOf<ConnectionStatusPresenterApi>();
    expectTypeOf<CreditRfqFilterPreferencePresenter>().toMatchTypeOf<CreditRfqFilterPreferencePresenterApi>();
    expectTypeOf<CurrencyPairsPresenter>().toMatchTypeOf<CurrencyPairsPresenterApi>();
    expectTypeOf<DealersPresenter>().toMatchTypeOf<DealersPresenterApi>();
    expectTypeOf<DepthPresenter>().toMatchTypeOf<DepthPresenterApi>();
    expectTypeOf<EqBlotterViewPreferencePresenter>().toMatchTypeOf<EqBlotterViewPreferencePresenterApi>();
    expectTypeOf<EqWatchlistSortPreferencePresenter>().toMatchTypeOf<EqWatchlistSortPreferencePresenterApi>();
    expectTypeOf<ErrorRatePresenter>().toMatchTypeOf<ErrorRatePresenterApi>();
    expectTypeOf<EventLogPresenter>().toMatchTypeOf<EventLogPresenterApi>();
    expectTypeOf<ForceBootAnimationPresenter>().toMatchTypeOf<ForceBootAnimationPresenterApi>();
    expectTypeOf<InstrumentsPresenter>().toMatchTypeOf<InstrumentsPresenterApi>();
    expectTypeOf<JarvisPanelsPresenter>().toMatchTypeOf<JarvisPanelsPresenterApi>();
    expectTypeOf<JarvisPreferencesPresenter>().toMatchTypeOf<JarvisPreferencesPresenterApi>();
    expectTypeOf<JarvisUsagePresenter>().toMatchTypeOf<JarvisUsagePresenterApi>();
    expectTypeOf<LatencyPresenter>().toMatchTypeOf<LatencyPresenterApi>();
    expectTypeOf<LayoutEnginePresenter>().toMatchTypeOf<LayoutEnginePresenterApi>();
    expectTypeOf<LoginWaitPreferencesPresenter>().toMatchTypeOf<LoginWaitPreferencesPresenterApi>();
    expectTypeOf<OrdersBlotterPresenter>().toMatchTypeOf<OrdersBlotterPresenterApi>();
    expectTypeOf<PositionsPresenter>().toMatchTypeOf<PositionsPresenterApi>();
    expectTypeOf<PowerSaverPresenter>().toMatchTypeOf<PowerSaverPresenterApi>();
    expectTypeOf<PriceHistoryPresenter>().toMatchTypeOf<PriceHistoryPresenterApi>();
    expectTypeOf<PriceStreamPresenter>().toMatchTypeOf<PriceStreamPresenterApi>();
    expectTypeOf<RfqQuotePresenter>().toMatchTypeOf<RfqQuotePresenterApi>();
    expectTypeOf<RfqsPresenter>().toMatchTypeOf<RfqsPresenterApi>();
    expectTypeOf<ServiceTopologyPresenter>().toMatchTypeOf<ServiceTopologyPresenterApi>();
    expectTypeOf<SessionsKpiPresenter>().toMatchTypeOf<SessionsKpiPresenterApi>();
    expectTypeOf<SessionsPresenter>().toMatchTypeOf<SessionsPresenterApi>();
    expectTypeOf<ThemePreferencePresenter>().toMatchTypeOf<ThemePreferencePresenterApi>();
    expectTypeOf<ThemeSkinPreferencePresenter>().toMatchTypeOf<ThemeSkinPreferencePresenterApi>();
    expectTypeOf<ThroughputMetricPresenter>().toMatchTypeOf<ThroughputMetricPresenterApi>();
    expectTypeOf<ThroughputPresenter>().toMatchTypeOf<ThroughputPresenterApi>();
    expectTypeOf<TradeExecutionPresenter>().toMatchTypeOf<TradeExecutionPresenterApi>();
    expectTypeOf<ViewModePreferencePresenter>().toMatchTypeOf<ViewModePreferencePresenterApi>();
    expectTypeOf<WatchlistPresenter>().toMatchTypeOf<WatchlistPresenterApi>();
  });
});
