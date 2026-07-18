import { state } from "@rx-state/core";
import { firstValueFrom } from "rxjs";
import type { Accessor } from "solid-js";

import type { ActivityEntry, AppCommands, Presenters } from "@rtc/client-core";
import {
  type AnimationIntent,
  type AuthViewState,
  type BootSequenceIntents,
  type BootSequenceState,
  createRfqCountdownMachine,
  type EqWorkspaceIntents,
  type EqWorkspaceState,
  type IncidentIntents,
  type IncidentKind,
  type IncidentState,
  type LayoutIntents,
  type LayoutState,
  type MachineFactories,
  type NotionalIntents,
  type NotionalView,
  type OrderTicketIntents,
  type OrderTicketState,
  type RfqState,
  type RfqSubmissionIntents,
  type RfqSubmissionState,
  type RfqTileIntents,
  type ThroughputView,
  type TicketSubmissionIntents,
  type TicketSubmissionState,
  type TileExecutionIntents,
  type TileExecutionState,
  type WorkspaceTab,
} from "@rtc/client-core";
import {
  type AmbientStyle,
  type Candle,
  type CandleTimeframe,
  ConnectionStatus,
  type CreditRfqFilter,
  type CurrencyPair,
  DEFAULT_AMBIENT_STYLE,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  type Dealer,
  type DepthBook,
  type EqBlotterView,
  type EquityInstrument,
  type EquityOrder,
  type EquityPosition,
  type EquityQuote,
  type EqWatchlistSort,
  type Instrument,
  type LogEvent,
  type MetricSample,
  type PositionUpdates,
  type Price,
  type PriceTick,
  type Quote,
  type Rfq,
  type ServiceTopology,
  type SessionInfo,
  type ThemeMode,
  type ThemeModePreference,
  type ThemeSkin,
  type Trade,
  type ViewMode,
} from "@rtc/domain";

import { toSignal } from "#/toSignal";
import { useMachine } from "#/useMachine";

// Machine-backed bundle types (state + intents). Solid transformation of the
// react-bindings shape `{ state: S } & I` → `{ state: Accessor<S> } & I` — the
// intents themselves are plain functions, unchanged. These 9 (plus
// UseEqWorkspaceResult below) back members wired to the real `useMachine`
// bridge in this task.
type UseBootSequenceResult = {
  state: Accessor<BootSequenceState>;
} & BootSequenceIntents;
type UseLayoutResult = { state: Accessor<LayoutState> } & LayoutIntents;
type UseTileExecutionResult = {
  state: Accessor<TileExecutionState>;
} & TileExecutionIntents;
type UseRfqTileResult = { state: Accessor<RfqState> } & RfqTileIntents;
type UseNotionalResult = { state: Accessor<NotionalView> } & NotionalIntents;
type UseRfqSubmissionResult = {
  state: Accessor<RfqSubmissionState>;
} & RfqSubmissionIntents;
type UseTicketSubmissionResult = {
  state: Accessor<TicketSubmissionState>;
} & TicketSubmissionIntents;
type UseOrderTicketResult = {
  state: Accessor<OrderTicketState>;
} & OrderTicketIntents;
/** Machine-adjacent: reads `presenters.eqWorkspace.state$` directly via
 * `toSignal` rather than a per-mount `useMachine` — the machine is warm by
 * construction (a composition-root singleton, not per-mount), so rebinding it
 * through another layer would only reintroduce the cold-wrapper trap
 * `toSignal` itself exists to avoid; see react-bindings' createViewModel.ts:539-567
 * for the full CRITICAL bug this shape was chosen to prevent. */
type UseEqWorkspaceResult = {
  state: Accessor<EqWorkspaceState>;
} & EqWorkspaceIntents;
/** Shared incident-machine bundle — IMPLEMENTED here: a plain `state()` read
 * of the singleton `presenters.incident.state$` (mirrors useAuth/useBootGate
 * below, not a per-mount `useMachine`), so it belongs to part 1. */
type UseIncidentResult = { state: Accessor<IncidentState> } & IncidentIntents;

/** The AdminPanel throughput view: slider/input value, initial-load flag, and
 * the optional confirmation/error banner — every read field as an accessor. */
interface UseThroughputResult {
  value: Accessor<number>;
  loading: Accessor<boolean>;
  message: Accessor<ThroughputView["message"]>;
  setValue: (value: number) => void;
}

interface MetricsView {
  throughput: Accessor<readonly MetricSample[]>;
  latency: Accessor<readonly MetricSample[]>;
  errorRate: Accessor<readonly MetricSample[]>;
}

interface UseThemePreferenceResult {
  /** The resolved mode that paints (system already collapsed to dark | light). */
  mode: Accessor<ThemeMode>;
  /** The stored choice (dark | light | system) — drives the toggle's icon. */
  modePreference: Accessor<ThemeModePreference>;
  /** Advance the stored preference one step: dark → light → system → dark. */
  cycle: () => void;
}

interface UseThemeSkinPreferenceResult {
  skin: Accessor<ThemeSkin>;
  setSkin: (skin: ThemeSkin) => void;
}

interface UseAnimatedBackgroundResult {
  enabled: Accessor<boolean>;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
}

interface UseAmbientStyleResult {
  style: Accessor<AmbientStyle>;
  setStyle: (style: AmbientStyle) => void;
}

interface UsePowerSaverResult {
  enabled: Accessor<boolean>;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
}

interface UseViewModePreferenceResult {
  viewMode: Accessor<ViewMode>;
  setViewMode: (viewMode: ViewMode) => void;
}

/** Credit RFQs panel filter preference — shared between the RFQs panel
 * (reader) and its head's filter pills (Task 4, writer). */
interface UseCreditRfqFilterPreferenceResult {
  filter: Accessor<CreditRfqFilter>;
  setFilter: (filter: CreditRfqFilter) => void;
}

interface UseEqWatchlistSortResult {
  sort: Accessor<EqWatchlistSort>;
  setSort: (sort: EqWatchlistSort) => void;
  /** Advance the sort one step (sym → chg → price → sym) — the Watchlist
   * head's ⇅ control. */
  cycle: () => void;
}

interface UseEqBlotterViewResult {
  view: Accessor<EqBlotterView>;
  setView: (view: EqBlotterView) => void;
}

interface UseAuthResult {
  state: Accessor<AuthViewState>;
  login: (username: string, password: string) => void;
  unlock: (password: string) => void;
  lock: () => void;
  logout: () => void;
}

interface UseBootGateResult {
  visible: Accessor<boolean>;
  reboot: () => void;
  dismiss: () => void;
}

export interface ViewModel {
  // Streams
  usePrice: (pair: CurrencyPair) => Accessor<Price | null>;
  usePriceHistory: (symbol: string) => Accessor<readonly PriceTick[]>;
  useTrades: () => Accessor<readonly Trade[]>;
  useNewTradeIds: () => Accessor<ReadonlySet<number>>;
  /** Live-executed trades, newest first, for the FX Blotter's Activity tab
   * (see BlotterPresenter.activity$ — seeded history never appears here). */
  useActivity: () => Accessor<readonly ActivityEntry[]>;
  useAnalytics: () => Accessor<PositionUpdates | null>;
  useRfqs: () => Accessor<readonly Rfq[]>;
  useQuotesForRfq: (rfqId: number) => Accessor<readonly Quote[]>;
  useAllQuotes: () => Accessor<ReadonlyMap<number, Quote>>;
  useCurrencyPairs: () => Accessor<readonly CurrencyPair[]>;
  useInstruments: () => Accessor<readonly Instrument[]>;
  useDealers: () => Accessor<readonly Dealer[]>;
  useConnectionStatus: () => Accessor<ConnectionStatus>;
  // Commands (one-shot fire-and-await; the bridge does firstValueFrom)
  useAcceptQuote: () => (quoteId: number) => Promise<void>;
  /** Cancel an in-flight RFQ (RfqsPresenter.cancelRfq). Same one-shot
   * fire-and-await shape as useAcceptQuote. */
  useCancelRfq: () => (rfqId: number) => Promise<void>;
  /** Fire-and-forget reconnect command — pushes a reconnect intent into the
   * app layer after an idle close. The sole recovery path from IDLE_DISCONNECTED.
   * Provenance: original components/DisconnectionOverlay.tsx:36 (onClick={initConnection}). */
  useReconnect: () => () => void;
  // Machines (app-layer RxJS behind the useMachine bridge) — STUBBED, Task 7.
  useTileExecution: (pair: CurrencyPair) => UseTileExecutionResult;
  useRfqTile: (pair: CurrencyPair) => UseRfqTileResult;
  // Intent-free derived flags: return just the boolean (no intents to expose).
  useStaleFlag: (pair: CurrencyPair) => Accessor<boolean>;
  useAnalyticsStaleFlag: () => Accessor<boolean>;
  /** Transient new-row highlight for a blotter row (`isNew` captured at mount). */
  useRowHighlight: (isNew: boolean) => Accessor<boolean>;
  /** Notional input state for a tile — view state plus intents. */
  useNotional: (defaultNotional: number) => UseNotionalResult;
  /** NewRfqForm create→confirm→redirect submission state plus the submit intent. */
  useRfqSubmission: () => UseRfqSubmissionResult;
  /** TradeTicket submit-price / pass submission state plus its intents. */
  useTicketSubmission: () => UseTicketSubmissionResult;
  /** Global throughput control — shared view state plus the setValue intent. */
  useThroughput: () => UseThroughputResult;
  /** Global theme mode preference — current mode plus write/zero-arg-toggle intents. */
  useThemePreference: () => UseThemePreferenceResult;
  /** Global theme skin preference — current skin plus the write intent. */
  useThemeSkinPreference: () => UseThemeSkinPreferenceResult;
  /** Global animated-background preference — enabled flag plus write/toggle intents. */
  useAnimatedBackground: () => UseAnimatedBackgroundResult;
  /** Global ambient-background style preference (aurora | rays) — current
   * style plus the write intent. */
  useAmbientStyle: () => UseAmbientStyleResult;
  /** Global power-saver master override — enabled flag plus write/toggle intents. */
  usePowerSaver: () => UsePowerSaverResult;
  /** Global live-rates view-mode preference — current mode plus the write intent. */
  useViewModePreference: () => UseViewModePreferenceResult;
  /** Credit RFQs panel LIVE/CLOSED/ALL filter preference — current filter plus
   * the write intent. Shared between RfqsPanel (reader) and RfqsHead's filter
   * pills (Task 4, writer). */
  useCreditRfqFilterPreference: () => UseCreditRfqFilterPreferenceResult;
  /** Equities watchlist sort-mode preference — current sort plus write/cycle
   * intents (the Watchlist head's ⇅ control). */
  useEqWatchlistSort: () => UseEqWatchlistSortResult;
  /** Equities blotter tab preference (Orders/Positions) — current view plus
   * the write intent. Plumbed here; Task 5's Blotter panel consumes it. */
  useEqBlotterView: () => UseEqBlotterViewResult;
  /** Global auth/session state (login/lock/logout lifecycle) plus its
   * login/unlock/lock/logout intents. Shared (one stream for the whole app),
   * so a plain `state()` like the prefs. */
  useAuth: () => UseAuthResult;
  /** Global boot-splash visibility plus reboot (⟳ Reboot HUD) / dismiss
   * intents. Shared (one stream for the whole app), so a plain `state()` like
   * useAuth. Seeded at composition time from the boot-splash decision. */
  useBootGate: () => UseBootGateResult;
  /** Per-RFQ countdown — remainingMs, ticking every 100ms, clamped at 0.
   * Cosmetic-only; the authoritative expiry is server-driven (CreditRfqSimulator).
   * Mirrors rtc-original CreditRfqTimer (creditRfqs.ts:102-112). */
  useRfqCountdown: (
    creationTimestamp: number,
    totalMs: number,
  ) => Accessor<number>;
  /** Latest animation intent for a target (e.g. "tile:EURUSD", "banner:connection").
   * Null until the AnimationDirector emits a real domain-driven intent; the dumb
   * UI maps the intent's kind to a CSS class / Motion One call. */
  useAnimationIntents: (target: string) => Accessor<AnimationIntent | null>;
  /** Layout view-model + intents for a workspace tab (the in-house engine). */
  useLayout: (tab: WorkspaceTab) => UseLayoutResult;
  /** Boot-sequence animation — progress ramp + skip intent. One per app mount.
   * Calls onDone when the ramp completes or skip is invoked. */
  useBootSequence: (onDone: () => void) => UseBootSequenceResult;
  // Equities streams
  /** Watchlist of equity instruments — starts empty until the market-data port emits. */
  useWatchlist: () => Accessor<readonly EquityInstrument[]>;
  /** Latest equity quote for a symbol — null until the first quote arrives. */
  useEquityQuote: (symbol: string) => Accessor<EquityQuote | null>;
  /** Candle series for a symbol at a timeframe (default "1D") — starts empty
   * until candles arrive. */
  useCandles: (
    symbol: string,
    timeframe?: CandleTimeframe,
  ) => Accessor<readonly Candle[]>;
  /** Depth book for a symbol — null until the first depth update arrives. */
  useDepth: (symbol: string) => Accessor<DepthBook | null>;
  /** All open/filled equity orders — starts empty. */
  useEquityOrders: () => Accessor<readonly EquityOrder[]>;
  /** Current equity positions — starts empty. */
  useEquityPositions: () => Accessor<readonly EquityPosition[]>;
  /** Per-mount order ticket machine — editing/submitting/working/filled/rejected state plus intents. */
  useOrderTicket: (defaultSymbol: string) => UseOrderTicketResult;
  /** Shared equities workspace state — selected symbol, open instrument tabs,
   * and chart timeframe. One machine instance for the whole app (a
   * composition-root singleton, not per-mount): the chart, instrument-tabs,
   * and watchlist panels are independent engine cells that read/write this
   * one shared source of truth. */
  useEqWorkspace: () => UseEqWorkspaceResult;
  // Admin / telemetry streams (Phase 5)
  /** Rolling metric chart series — throughput, latency, and error-rate windows. */
  useMetrics: () => MetricsView;
  /** Live service-topology graph — null until the first emission. */
  useTopology: () => Accessor<ServiceTopology | null>;
  /** Newest-first rolling event log — starts empty. */
  useEventLog: () => Accessor<readonly LogEvent[]>;
  /** Active trader sessions — starts empty. */
  useSessions: () => Accessor<readonly SessionInfo[]>;
  /** Rolling session-count series for the Admin "Active Sessions" KPI card —
   * starts empty, mirrors useMetrics()'s three streams in shape. */
  useSessionCountSeries: () => Accessor<readonly MetricSample[]>;
  /** Shared incident-machine state + inject/clear intents. */
  useIncident: () => UseIncidentResult;
}

export function createViewModel(
  presenters: Presenters,
  machines: MachineFactories,
  commands: AppCommands,
): ViewModel {
  const priceState = state(
    (pair: CurrencyPair) => {
      return presenters.priceStream.price$(pair);
    },
    null as Price | null,
  );
  const priceHistoryState = state(
    (symbol: string) => {
      return presenters.priceHistory.history$(symbol);
    },
    [] as readonly PriceTick[],
  );
  const tradesState = state(presenters.blotter.trades$, [] as readonly Trade[]);
  const newTradeIdsState = state(
    presenters.blotter.newTradeIds$,
    new Set<number>() as ReadonlySet<number>,
  );
  const activityState = state(
    presenters.blotter.activity$,
    [] as readonly ActivityEntry[],
  );
  const analyticsState = state(
    presenters.analytics.position$,
    null as PositionUpdates | null,
  );
  const rfqsState = state(presenters.rfqs.rfqs$, [] as readonly Rfq[]);
  const quotesForRfqState = state(
    (rfqId: number) => {
      return presenters.rfqs.quotesForRfq$(rfqId);
    },
    [] as readonly Quote[],
  );
  const allQuotesState = state(
    presenters.rfqs.allQuotes$,
    new Map() as ReadonlyMap<number, Quote>,
  );
  const currencyPairsState = state(
    presenters.currencyPairs.pairs$,
    [] as readonly CurrencyPair[],
  );
  const instrumentsState = state(
    presenters.instruments.list$,
    [] as readonly Instrument[],
  );
  const dealersState = state(presenters.dealers.list$, [] as readonly Dealer[]);
  const connectionStatusState = state(
    presenters.connection.status$,
    ConnectionStatus.CONNECTING,
  );

  // Global/shared throughput state → a plain `state()` (not a per-mount machine).
  const throughputState = state(presenters.throughput.state$, {
    value: 100,
    loading: true,
    message: null,
  } as ThroughputView);

  function setThroughput(value: number): void {
    presenters.throughput.setValue(value);
  }

  // Global/shared display preferences → plain `state()`s (not per-mount machines).
  const themeModeState = state(
    presenters.themePreference.mode$,
    DEFAULT_THEME_MODE,
  );
  const themeModePreferenceState = state(
    presenters.themePreference.modePreference$,
    DEFAULT_THEME_MODE_PREFERENCE,
  );

  const themeSkinState = state(
    presenters.themeSkinPreference.skin$,
    DEFAULT_THEME_SKIN,
  );

  function setThemeSkin(skin: ThemeSkin): void {
    presenters.themeSkinPreference.setSkin(skin);
  }

  const ambientStyleState = state(
    presenters.ambientStyle.style$,
    DEFAULT_AMBIENT_STYLE,
  );

  function setAmbientStyle(style: AmbientStyle): void {
    presenters.ambientStyle.setStyle(style);
  }

  const animatedBgState = state(presenters.animatedBackground.enabled$, false);

  function setAnimatedBg(on: boolean): void {
    presenters.animatedBackground.set(on);
  }

  const powerSaverState = state(presenters.powerSaver.enabled$, false);

  function setPowerSaver(on: boolean): void {
    presenters.powerSaver.set(on);
  }

  const viewModeState = state(
    presenters.viewModePreference.viewMode$,
    DEFAULT_VIEW_MODE,
  );

  function setViewMode(viewMode: ViewMode): void {
    presenters.viewModePreference.setViewMode(viewMode);
  }

  const creditRfqFilterState = state(
    presenters.creditRfqFilterPreference.filter$,
    DEFAULT_CREDIT_RFQ_FILTER,
  );

  function setCreditRfqFilter(filter: CreditRfqFilter): void {
    presenters.creditRfqFilterPreference.setFilter(filter);
  }

  const eqWatchlistSortState = state(
    presenters.eqWatchlistSortPreference.sort$,
    DEFAULT_EQ_WATCHLIST_SORT,
  );

  function setEqWatchlistSort(sort: EqWatchlistSort): void {
    presenters.eqWatchlistSortPreference.setSort(sort);
  }

  const eqBlotterViewState = state(
    presenters.eqBlotterViewPreference.view$,
    DEFAULT_EQ_BLOTTER_VIEW,
  );

  function setEqBlotterView(view: EqBlotterView): void {
    presenters.eqBlotterViewPreference.setView(view);
  }

  // Global/shared auth state → a plain `state()` (not a per-mount machine).
  const authState = state(presenters.auth.state$, {
    status: "unauthenticated",
    user: null,
    locked: false,
    error: null,
  } as AuthViewState);

  // Stable command callbacks (the presenter methods touch `this`).
  function loginAuth(username: string, password: string): void {
    presenters.auth.login(username, password);
  }

  function unlockAuth(password: string): void {
    presenters.auth.unlock(password);
  }

  function lockAuth(): void {
    presenters.auth.lock();
  }

  function logoutAuth(): void {
    presenters.auth.logout();
  }

  // Global/shared boot-splash visibility → a plain `state()` (not a per-mount
  // machine), mirroring authState. `state()` serves its DEFAULT on a cold
  // source, so the default must be the presenter's ACTUAL current value (see
  // react-bindings createViewModel.ts:422-431 for the full warm-value trap
  // this avoids) — a literal `true` here would transiently seed the opaque
  // splash for a subscriber that reads before bootGate.visible$ is warm.
  const bootGateVisibleState = state(
    presenters.bootGate.visible$,
    presenters.bootGate.visible,
  );

  function rebootHud(): void {
    presenters.bootGate.reboot();
  }

  function dismissBootSplash(): void {
    presenters.bootGate.dismiss();
  }

  // Animation intents → a parameterized `state()` (one per-target stream, like priceState).
  // Starts null; the dumb UI maps an emitted intent's kind to a CSS class / Motion call.
  const animationIntentsState = state(
    (target: string) => {
      return presenters.animationDirector.intentsFor(target);
    },
    null as AnimationIntent | null,
  );

  // Pre-bound command callbacks. Stable references — the bridge converts each
  // one-shot presenter Observable to a Promise via firstValueFrom — the void
  // commands' presenters emit `undefined` before completing, so firstValueFrom
  // resolves (rather than rejecting with EmptyError) without a defaultValue.
  function acceptQuote(quoteId: number): Promise<void> {
    return firstValueFrom(presenters.rfqs.acceptQuote(quoteId));
  }

  function cancelRfq(rfqId: number): Promise<void> {
    return firstValueFrom(presenters.rfqs.cancelRfq(rfqId));
  }

  // Equities streams — shared (one active subscription per symbol, ref-counted by state()).
  const watchlistState = state(
    presenters.watchlist.watchlist$,
    [] as readonly EquityInstrument[],
  );
  const equityQuoteState = state(
    (symbol: string) => {
      return presenters.watchlist.quote$(symbol);
    },
    null as EquityQuote | null,
  );
  const candlesState = state(
    (symbol: string, timeframe?: CandleTimeframe) => {
      return presenters.candleSeries.candles$(symbol, timeframe);
    },
    [] as readonly Candle[],
  );
  const depthState = state(
    (symbol: string) => {
      return presenters.depth.depth$(symbol);
    },
    null as DepthBook | null,
  );
  const equityOrdersState = state(
    presenters.ordersBlotter.orders$,
    [] as readonly EquityOrder[],
  );
  const equityPositionsState = state(
    presenters.positions.positions$,
    [] as readonly EquityPosition[],
  );

  // Admin / telemetry streams (Phase 5) — plain `state()`s (shared, not per-mount).
  const throughputSamplesState = state(
    presenters.throughputMetric.samples$,
    [] as readonly MetricSample[],
  );
  const latencySamplesState = state(
    presenters.latencyMetric.samples$,
    [] as readonly MetricSample[],
  );
  const errorRateSamplesState = state(
    presenters.errorRateMetric.samples$,
    [] as readonly MetricSample[],
  );
  const topologyState = state(
    presenters.topology.topology$,
    null as ServiceTopology | null,
  );
  const eventLogState = state(
    presenters.eventLog.events$,
    [] as readonly LogEvent[],
  );
  const sessionsState = state(
    presenters.sessions.sessions$,
    [] as readonly SessionInfo[],
  );
  const sessionCountSeriesState = state(
    presenters.sessionsKpi.countSeries$,
    [] as readonly MetricSample[],
  );

  // Incident machine — shared single instance; `state()` its state$ (not a
  // per-mount useMachine — same shared-singleton shape as session/bootGate above).
  const incidentState = state(presenters.incident.state$, {
    active: [] as readonly IncidentKind[],
  });

  function injectIncident(kind: IncidentKind): void {
    presenters.incident.intents.inject(kind);
  }

  function clearIncident(): void {
    presenters.incident.intents.clear();
  }

  // Stable callbacks for eqWorkspace intents.
  function selectEqSymbol(sym: string): void {
    presenters.eqWorkspace.intents.select(sym);
  }

  function closeEqTab(sym: string): void {
    presenters.eqWorkspace.intents.closeTab(sym);
  }

  function setEqTimeframe(tf: CandleTimeframe): void {
    presenters.eqWorkspace.intents.setTimeframe(tf);
  }

  return {
    usePrice: (pair: CurrencyPair) => {
      return toSignal(priceState(pair));
    },
    usePriceHistory: (symbol: string) => {
      return toSignal(priceHistoryState(symbol));
    },
    useTrades: () => {
      return toSignal(tradesState);
    },
    useNewTradeIds: () => {
      return toSignal(newTradeIdsState);
    },
    useActivity: () => {
      return toSignal(activityState);
    },
    useAnalytics: () => {
      return toSignal(analyticsState);
    },
    useRfqs: () => {
      return toSignal(rfqsState);
    },
    useQuotesForRfq: (rfqId: number) => {
      return toSignal(quotesForRfqState(rfqId));
    },
    useAllQuotes: () => {
      return toSignal(allQuotesState);
    },
    useCurrencyPairs: () => {
      return toSignal(currencyPairsState);
    },
    useInstruments: () => {
      return toSignal(instrumentsState);
    },
    useDealers: () => {
      return toSignal(dealersState);
    },
    useConnectionStatus: () => {
      return toSignal(connectionStatusState);
    },
    useAcceptQuote: () => {
      return acceptQuote;
    },
    useCancelRfq: () => {
      return cancelRfq;
    },
    useReconnect: () => {
      return commands.reconnect;
    },
    useTileExecution: (pair: CurrencyPair) => {
      return useMachine(() => {
        return machines.tileExecution(pair);
      });
    },
    useRfqTile: (pair: CurrencyPair) => {
      return useMachine(() => {
        return machines.rfqTile(pair);
      });
    },
    useStaleFlag: (pair: CurrencyPair) => {
      return useMachine(() => {
        return machines.staleFlag(pair);
      }).state;
    },
    useAnalyticsStaleFlag: () => {
      return useMachine(() => {
        return machines.analyticsStaleFlag();
      }).state;
    },
    useRowHighlight: (isNew: boolean) => {
      return useMachine(() => {
        return machines.rowHighlight(isNew);
      }).state;
    },
    useNotional: (defaultNotional: number) => {
      return useMachine(() => {
        return machines.notional(defaultNotional);
      });
    },
    useRfqSubmission: () => {
      return useMachine(() => {
        return machines.rfqSubmission();
      });
    },
    useTicketSubmission: () => {
      return useMachine(() => {
        return machines.ticketSubmission();
      });
    },
    useThroughput: () => {
      const throughput = toSignal(throughputState);

      return {
        value: () => {
          return throughput().value;
        },
        loading: () => {
          return throughput().loading;
        },
        message: () => {
          return throughput().message;
        },
        setValue: setThroughput,
      };
    },
    // Global theme mode: read the resolved mode (for painting) and the stored
    // preference (for the toggle icon) in the hook body, so the component calls a
    // zero-arg cycle() that advances relative to the live preference value.
    useThemePreference: () => {
      return {
        mode: toSignal(themeModeState),
        modePreference: toSignal(themeModePreferenceState),
        // cycle() reads the current preference in the presenter (not a
        // captured render value), so rapid clicks each advance from the true state.
        cycle: () => {
          presenters.themePreference.cycle();
        },
      };
    },
    useThemeSkinPreference: () => {
      return { skin: toSignal(themeSkinState), setSkin: setThemeSkin };
    },
    useAmbientStyle: () => {
      return { style: toSignal(ambientStyleState), setStyle: setAmbientStyle };
    },
    useAnimatedBackground: () => {
      const enabled = toSignal(animatedBgState);

      return {
        enabled,
        setEnabled: setAnimatedBg,
        toggle: () => {
          presenters.animatedBackground.toggle(enabled());
        },
      };
    },
    usePowerSaver: () => {
      const enabled = toSignal(powerSaverState);

      return {
        enabled,
        setEnabled: setPowerSaver,
        toggle: () => {
          presenters.powerSaver.toggle(enabled());
        },
      };
    },
    useViewModePreference: () => {
      return {
        viewMode: toSignal(viewModeState),
        setViewMode,
      };
    },
    useCreditRfqFilterPreference: () => {
      return {
        filter: toSignal(creditRfqFilterState),
        setFilter: setCreditRfqFilter,
      };
    },
    useEqWatchlistSort: () => {
      return {
        sort: toSignal(eqWatchlistSortState),
        setSort: setEqWatchlistSort,
        cycle: () => {
          presenters.eqWatchlistSortPreference.cycle();
        },
      };
    },
    useEqBlotterView: () => {
      return {
        view: toSignal(eqBlotterViewState),
        setView: setEqBlotterView,
      };
    },
    useAuth: () => {
      return {
        state: toSignal(authState),
        login: loginAuth,
        unlock: unlockAuth,
        lock: lockAuth,
        logout: logoutAuth,
      };
    },
    useBootGate: () => {
      return {
        visible: toSignal(bootGateVisibleState),
        reboot: rebootHud,
        dismiss: dismissBootSplash,
      };
    },
    useRfqCountdown: (creationTimestamp: number, totalMs: number) => {
      return useMachine(() => {
        return createRfqCountdownMachine(creationTimestamp, totalMs);
      }).state;
    },
    useAnimationIntents: (target: string) => {
      return toSignal(animationIntentsState(target));
    },
    useLayout: (tab: WorkspaceTab) => {
      return useMachine(() => {
        return machines.layout(tab);
      });
    },
    useBootSequence: (onDone: () => void) => {
      return useMachine(() => {
        return machines.boot(onDone);
      });
    },
    useWatchlist: () => {
      return toSignal(watchlistState);
    },
    useEquityQuote: (symbol: string) => {
      return toSignal(equityQuoteState(symbol));
    },
    useCandles: (symbol: string, timeframe?: CandleTimeframe) => {
      return toSignal(candlesState(symbol, timeframe));
    },
    useDepth: (symbol: string) => {
      return toSignal(depthState(symbol));
    },
    useEquityOrders: () => {
      return toSignal(equityOrdersState);
    },
    useEquityPositions: () => {
      return toSignal(equityPositionsState);
    },
    useOrderTicket: (defaultSymbol: string) => {
      return useMachine(() => {
        return machines.orderTicket(defaultSymbol);
      });
    },
    useEqWorkspace: () => {
      return {
        state: toSignal(presenters.eqWorkspace.state$),
        select: selectEqSymbol,
        closeTab: closeEqTab,
        setTimeframe: setEqTimeframe,
      };
    },
    useMetrics: () => {
      return {
        throughput: toSignal(throughputSamplesState),
        latency: toSignal(latencySamplesState),
        errorRate: toSignal(errorRateSamplesState),
      };
    },
    useTopology: () => {
      return toSignal(topologyState);
    },
    useEventLog: () => {
      return toSignal(eventLogState);
    },
    useSessions: () => {
      return toSignal(sessionsState);
    },
    useSessionCountSeries: () => {
      return toSignal(sessionCountSeriesState);
    },
    useIncident: () => {
      return {
        state: toSignal(incidentState),
        inject: injectIncident,
        clear: clearIncident,
      };
    },
  };
}
