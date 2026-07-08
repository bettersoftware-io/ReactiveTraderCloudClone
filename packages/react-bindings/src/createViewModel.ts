import { bind, useStateObservable } from "@react-rxjs/core";
import { firstValueFrom } from "rxjs";

import type { ActivityEntry, AppCommands, Presenters } from "@rtc/client-core";
import {
  type AnimationIntent,
  type BootSequenceIntents,
  type BootSequenceState,
  createRfqCountdownMachine,
  DEMO_USER,
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
  type SessionState,
  type ThroughputView,
  type TicketSubmissionIntents,
  type TicketSubmissionState,
  type TileExecutionIntents,
  type TileExecutionState,
  type WorkspaceTab,
} from "@rtc/client-core";
import {
  type Candle,
  type CandleTimeframe,
  ConnectionStatus,
  type CreditRfqFilter,
  type CurrencyPair,
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

import { useMachine } from "#/useMachine";

type UseBootSequenceResult = { state: BootSequenceState } & BootSequenceIntents;
type UseIncidentResult = { state: IncidentState } & IncidentIntents;
type UseLayoutResult = { state: LayoutState } & LayoutIntents;
type UseTileExecutionResult = {
  state: TileExecutionState;
} & TileExecutionIntents;
type UseRfqTileResult = { state: RfqState } & RfqTileIntents;
type UseNotionalResult = { state: NotionalView } & NotionalIntents;
type UseRfqSubmissionResult = {
  state: RfqSubmissionState;
} & RfqSubmissionIntents;
type UseTicketSubmissionResult = {
  state: TicketSubmissionState;
} & TicketSubmissionIntents;
type UseThroughputResult = ThroughputView & {
  setValue: (value: number) => void;
};
type UseOrderTicketResult = { state: OrderTicketState } & OrderTicketIntents;
type UseEqWorkspaceResult = {
  state: EqWorkspaceState;
} & EqWorkspaceIntents;

interface MetricsView {
  throughput: readonly MetricSample[];
  latency: readonly MetricSample[];
  errorRate: readonly MetricSample[];
}

interface UseThemePreferenceResult {
  /** The resolved mode that paints (system already collapsed to dark | light). */
  mode: ThemeMode;
  /** The stored choice (dark | light | system) — drives the toggle's icon. */
  modePreference: ThemeModePreference;
  /** Advance the stored preference one step: dark → light → system → dark. */
  cycle: () => void;
}

interface UseThemeSkinPreferenceResult {
  skin: ThemeSkin;
  setSkin: (skin: ThemeSkin) => void;
}

interface UseAnimatedBackgroundResult {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
}

interface UseViewModePreferenceResult {
  viewMode: ViewMode;
  setViewMode: (viewMode: ViewMode) => void;
}

/** Credit RFQs panel filter preference — shared between the RFQs panel
 * (reader) and its head's filter pills (Task 4, writer). */
interface UseCreditRfqFilterPreferenceResult {
  filter: CreditRfqFilter;
  setFilter: (filter: CreditRfqFilter) => void;
}

interface UseEqWatchlistSortResult {
  sort: EqWatchlistSort;
  setSort: (sort: EqWatchlistSort) => void;
  /** Advance the sort one step (sym → chg → price → sym) — the Watchlist
   * head's ⇅ control. */
  cycle: () => void;
}

interface UseEqBlotterViewResult {
  view: EqBlotterView;
  setView: (view: EqBlotterView) => void;
}

interface UseSessionResult {
  state: SessionState;
  lock: () => void;
  unlock: () => void;
}

interface UseBootGateResult {
  visible: boolean;
  reboot: () => void;
  dismiss: () => void;
}

export interface ViewModel {
  // Streams
  usePrice: (pair: CurrencyPair) => Price | null;
  usePriceHistory: (symbol: string) => readonly PriceTick[];
  useTrades: () => readonly Trade[];
  useNewTradeIds: () => ReadonlySet<number>;
  /** Live-executed trades, newest first, for the FX Blotter's Activity tab
   * (see BlotterPresenter.activity$ — seeded history never appears here). */
  useActivity: () => readonly ActivityEntry[];
  useAnalytics: () => PositionUpdates | null;
  useRfqs: () => readonly Rfq[];
  useQuotesForRfq: (rfqId: number) => readonly Quote[];
  useAllQuotes: () => ReadonlyMap<number, Quote>;
  useCurrencyPairs: () => readonly CurrencyPair[];
  useInstruments: () => readonly Instrument[];
  useDealers: () => readonly Dealer[];
  useConnectionStatus: () => ConnectionStatus;
  // Commands (one-shot fire-and-await; the bridge does firstValueFrom)
  useAcceptQuote: () => (quoteId: number) => Promise<void>;
  /** Cancel an in-flight RFQ (RfqsPresenter.cancelRfq). Same one-shot
   * fire-and-await shape as useAcceptQuote. */
  useCancelRfq: () => (rfqId: number) => Promise<void>;
  /** Fire-and-forget reconnect command — pushes a reconnect intent into the
   * app layer after an idle close. The sole recovery path from IDLE_DISCONNECTED.
   * Provenance: original components/DisconnectionOverlay.tsx:36 (onClick={initConnection}). */
  useReconnect: () => () => void;
  // Machines (app-layer RxJS behind the useMachine bridge)
  useTileExecution: (pair: CurrencyPair) => UseTileExecutionResult;
  useRfqTile: (pair: CurrencyPair) => UseRfqTileResult;
  // Intent-free derived flags: return just the boolean (no intents to expose).
  useStaleFlag: (pair: CurrencyPair) => boolean;
  useAnalyticsStaleFlag: () => boolean;
  /** Transient new-row highlight for a blotter row (`isNew` captured at mount). */
  useRowHighlight: (isNew: boolean) => boolean;
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
  /** Global session lock state plus lock/unlock (re-authenticate) intents.
   * Shared (one stream for the whole app), so a plain `bind` like the prefs. */
  useSession: () => UseSessionResult;
  /** Global boot-splash visibility plus reboot (⟳ Reboot HUD) / dismiss
   * intents. Shared (one stream for the whole app), so a plain `bind` like
   * useSession. Seeded at composition time from the boot-splash decision. */
  useBootGate: () => UseBootGateResult;
  /** Per-RFQ countdown — remainingMs, ticking every 100ms, clamped at 0.
   * Cosmetic-only; the authoritative expiry is server-driven (CreditRfqSimulator).
   * Mirrors rtc-original CreditRfqTimer (creditRfqs.ts:102-112). */
  useRfqCountdown: (creationTimestamp: number, totalMs: number) => number;
  /** Latest animation intent for a target (e.g. "tile:EURUSD", "banner:connection").
   * Null until the AnimationDirector emits a real domain-driven intent; the dumb
   * UI maps the intent's kind to a CSS class / Motion One call. */
  useAnimationIntents: (target: string) => AnimationIntent | null;
  /** Layout view-model + intents for a workspace tab (the in-house engine). */
  useLayout: (tab: WorkspaceTab) => UseLayoutResult;
  /** Boot-sequence animation — progress ramp + skip intent. One per app mount.
   * Calls onDone when the ramp completes or skip is invoked. */
  useBootSequence: (onDone: () => void) => UseBootSequenceResult;
  // Equities streams
  /** Watchlist of equity instruments — starts empty until the market-data port emits. */
  useWatchlist: () => readonly EquityInstrument[];
  /** Latest equity quote for a symbol — null until the first quote arrives. */
  useEquityQuote: (symbol: string) => EquityQuote | null;
  /** Candle series for a symbol at a timeframe (default "1D") — starts empty
   * until candles arrive. */
  useCandles: (
    symbol: string,
    timeframe?: CandleTimeframe,
  ) => readonly Candle[];
  /** Depth book for a symbol — null until the first depth update arrives. */
  useDepth: (symbol: string) => DepthBook | null;
  /** All open/filled equity orders — starts empty. */
  useEquityOrders: () => readonly EquityOrder[];
  /** Current equity positions — starts empty. */
  useEquityPositions: () => readonly EquityPosition[];
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
  useTopology: () => ServiceTopology | null;
  /** Newest-first rolling event log — starts empty. */
  useEventLog: () => readonly LogEvent[];
  /** Active trader sessions — starts empty. */
  useSessions: () => readonly SessionInfo[];
  /** Rolling session-count series for the Admin "Active Sessions" KPI card —
   * starts empty, mirrors useMetrics()'s three streams in shape. */
  useSessionCountSeries: () => readonly MetricSample[];
  /** Shared incident-machine state + inject/clear intents. */
  useIncident: () => UseIncidentResult;
}

export function createViewModel(
  presenters: Presenters,
  machines: MachineFactories,
  commands: AppCommands,
): ViewModel {
  const [usePrice] = bind((pair: CurrencyPair) => {
    return presenters.priceStream.price$(pair);
  }, null);
  const [usePriceHistory] = bind(
    (symbol: string) => {
      return presenters.priceHistory.history$(symbol);
    },
    [] as readonly PriceTick[],
  );
  const [useTrades] = bind(presenters.blotter.trades$, [] as readonly Trade[]);
  const [useNewTradeIds] = bind(
    presenters.blotter.newTradeIds$,
    new Set<number>() as ReadonlySet<number>,
  );
  const [useActivity] = bind(
    presenters.blotter.activity$,
    [] as readonly ActivityEntry[],
  );
  const [useAnalytics] = bind(
    presenters.analytics.position$,
    null as PositionUpdates | null,
  );
  const [useRfqs] = bind(presenters.rfqs.rfqs$, [] as readonly Rfq[]);
  const [useQuotesForRfq] = bind(
    (rfqId: number) => {
      return presenters.rfqs.quotesForRfq$(rfqId);
    },
    [] as readonly Quote[],
  );
  const [useAllQuotes] = bind(
    presenters.rfqs.allQuotes$,
    new Map() as ReadonlyMap<number, Quote>,
  );
  const [useCurrencyPairs] = bind(
    presenters.currencyPairs.pairs$,
    [] as readonly CurrencyPair[],
  );
  const [useInstruments] = bind(
    presenters.instruments.list$,
    [] as readonly Instrument[],
  );
  const [useDealers] = bind(presenters.dealers.list$, [] as readonly Dealer[]);
  const [useConnectionStatus] = bind(
    presenters.connection.status$,
    ConnectionStatus.CONNECTING,
  );
  // Global/shared throughput state → a plain bind (not a per-mount machine).
  const [useThroughputState] = bind(presenters.throughput.state$, {
    value: 100,
    loading: true,
    message: null,
  } as ThroughputView);

  function setThroughput(value: number): void {
    presenters.throughput.setValue(value);
  }

  // Global/shared display preferences → plain binds (not per-mount machines).
  const [useThemeModeValue] = bind(
    presenters.themePreference.mode$,
    DEFAULT_THEME_MODE,
  );
  const [useThemeModePreferenceValue] = bind(
    presenters.themePreference.modePreference$,
    DEFAULT_THEME_MODE_PREFERENCE,
  );

  const [useThemeSkinValue] = bind(
    presenters.themeSkinPreference.skin$,
    DEFAULT_THEME_SKIN,
  );

  function setThemeSkin(skin: ThemeSkin): void {
    presenters.themeSkinPreference.setSkin(skin);
  }

  const [useAnimatedBgValue] = bind(
    presenters.animatedBackground.enabled$,
    false,
  );

  function setAnimatedBg(on: boolean): void {
    presenters.animatedBackground.set(on);
  }

  const [useViewModeValue] = bind(
    presenters.viewModePreference.viewMode$,
    DEFAULT_VIEW_MODE,
  );

  function setViewMode(viewMode: ViewMode): void {
    presenters.viewModePreference.setViewMode(viewMode);
  }

  const [useCreditRfqFilterValue] = bind(
    presenters.creditRfqFilterPreference.filter$,
    DEFAULT_CREDIT_RFQ_FILTER,
  );

  function setCreditRfqFilter(filter: CreditRfqFilter): void {
    presenters.creditRfqFilterPreference.setFilter(filter);
  }

  const [useEqWatchlistSortValue] = bind(
    presenters.eqWatchlistSortPreference.sort$,
    DEFAULT_EQ_WATCHLIST_SORT,
  );

  function setEqWatchlistSort(sort: EqWatchlistSort): void {
    presenters.eqWatchlistSortPreference.setSort(sort);
  }

  const [useEqBlotterViewValue] = bind(
    presenters.eqBlotterViewPreference.view$,
    DEFAULT_EQ_BLOTTER_VIEW,
  );

  function setEqBlotterView(view: EqBlotterView): void {
    presenters.eqBlotterViewPreference.setView(view);
  }

  // Global/shared session lock state → a plain bind (not a per-mount machine).
  const [useSessionState] = bind(presenters.session.state$, {
    locked: false,
    user: DEMO_USER,
  } as SessionState);

  // Stable, this-bound command callbacks (the presenter methods touch `this`).
  function lockSession(): void {
    presenters.session.lock();
  }

  function unlockSession(): void {
    presenters.session.unlock();
  }

  // Global/shared boot-splash visibility → a plain bind (not a per-mount
  // machine), mirroring useSessionState. The default matches the presenter's
  // default-visible construction so a real user's first paint keeps the splash.
  const [useBootGateVisible] = bind(presenters.bootGate.visible$, true);

  function rebootHud(): void {
    presenters.bootGate.reboot();
  }

  function dismissBootSplash(): void {
    presenters.bootGate.dismiss();
  }

  // Animation intents → a parameterized bind (one per-target stream, like usePrice).
  // Starts null; the dumb UI maps an emitted intent's kind to a CSS class / Motion call.
  const [useAnimationIntents] = bind(
    (target: string) => {
      return presenters.animationDirector.intentsFor(target);
    },
    null as AnimationIntent | null,
  );

  // Pre-bound command callbacks. Stable references across calls so React
  // memo/effect dep arrays remain stable. The bridge converts each one-shot
  // presenter Observable to a Promise via firstValueFrom — the void commands'
  // presenters emit `undefined` before completing, so firstValueFrom resolves
  // (rather than rejecting with EmptyError) without needing a defaultValue.
  function acceptQuote(quoteId: number): Promise<void> {
    return firstValueFrom(presenters.rfqs.acceptQuote(quoteId));
  }

  function cancelRfq(rfqId: number): Promise<void> {
    return firstValueFrom(presenters.rfqs.cancelRfq(rfqId));
  }

  // Equities streams — shared (one active subscription per symbol, reference-counted by bind).
  const [useWatchlist] = bind(
    presenters.watchlist.watchlist$,
    [] as readonly EquityInstrument[],
  );
  const [useEquityQuote] = bind(
    (symbol: string) => {
      return presenters.watchlist.quote$(symbol);
    },
    null as EquityQuote | null,
  );
  const [useCandles] = bind(
    (symbol: string, timeframe?: CandleTimeframe) => {
      return presenters.candleSeries.candles$(symbol, timeframe);
    },
    [] as readonly Candle[],
  );
  const [useDepth] = bind(
    (symbol: string) => {
      return presenters.depth.depth$(symbol);
    },
    null as DepthBook | null,
  );
  const [useEquityOrders] = bind(
    presenters.ordersBlotter.orders$,
    [] as readonly EquityOrder[],
  );
  const [useEquityPositions] = bind(
    presenters.positions.positions$,
    [] as readonly EquityPosition[],
  );

  // Admin / telemetry streams (Phase 5) — plain binds (shared, not per-mount).
  const [useThroughputSamples] = bind(
    presenters.throughputMetric.samples$,
    [] as readonly MetricSample[],
  );
  const [useLatencySamples] = bind(
    presenters.latencyMetric.samples$,
    [] as readonly MetricSample[],
  );
  const [useErrorRateSamples] = bind(
    presenters.errorRateMetric.samples$,
    [] as readonly MetricSample[],
  );
  const [useTopologyValue] = bind(
    presenters.topology.topology$,
    null as ServiceTopology | null,
  );
  const [useEventLogValue] = bind(
    presenters.eventLog.events$,
    [] as readonly LogEvent[],
  );
  const [useSessionsValue] = bind(
    presenters.sessions.sessions$,
    [] as readonly SessionInfo[],
  );
  const [useSessionCountSeriesValue] = bind(
    presenters.sessionsKpi.countSeries$,
    [] as readonly MetricSample[],
  );

  // Incident machine — shared single instance, bind its state$ (not per-mount useMachine).
  const [useIncidentState] = bind(presenters.incident.state$, {
    active: [] as readonly IncidentKind[],
  });

  // Stable callbacks for incident intents (this-safe; arrow functions).
  function injectIncident(kind: IncidentKind): void {
    presenters.incident.intents.inject(kind);
  }

  function clearIncident(): void {
    presenters.incident.intents.clear();
  }

  // Eq workspace machine — shared single instance. Reads
  // presenters.eqWorkspace.state$ DIRECTLY via useStateObservable, NOT via
  // bind() (unlike the incident machine's wiring above, and unlike this
  // function's own first draft — see the CRITICAL bug this replaced).
  //
  // bind(source$, defaultValue) builds its OWN new StateObservable wrapping
  // source$; that NEW wrapper's currentValue/refCount start out empty
  // regardless of how warm source$ already is, and only pick up a value once
  // the WRAPPER gets its first subscriber — which react-rxjs's
  // useSyncExternalStore-based hook defers to a passive effect, i.e. AFTER
  // the first commit. On that first render every caller (e.g. ChartPanel)
  // therefore saw the explicit default ({sel: "", ...}), never
  // EqWorkspaceMachine's real warm value, even though the machine keeps
  // itself warm from construction (see its own doc comment) specifically to
  // avoid this. ChartPanel calls useCandles(sel, timeframe) unconditionally
  // (before its own `if (!sel)` guard), so an empty sel reached
  // EquityMarketDataSimulator.candles(""), which throws synchronously for
  // any symbol it doesn't recognise — crashing the whole app on the very
  // first Equities-tab render, with no ErrorBoundary to contain it.
  //
  // Calling useStateObservable directly on the machine's OWN (already-warm,
  // refCount >= 1) state$ reads its real currentValue synchronously on the
  // very first render: no extra wrapper, no mismatched default, no window
  // where a stale/invalid value can leak downstream. This mirrors why
  // useMachine reads a per-mount machine's own state$ directly instead of
  // re-binding it — the source is already the right shape to read as-is.
  function useEqWorkspaceState(): EqWorkspaceState {
    return useStateObservable(presenters.eqWorkspace.state$);
  }

  // Stable callbacks for eqWorkspace intents (this-safe; arrow functions).
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
    usePrice,
    usePriceHistory,
    useTrades,
    useNewTradeIds,
    useActivity,
    useAnalytics,
    useRfqs,
    useQuotesForRfq,
    useAllQuotes,
    useCurrencyPairs,
    useInstruments,
    useDealers,
    useConnectionStatus,
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
      return { ...useThroughputState(), setValue: setThroughput };
    },
    // Global theme mode: read the resolved mode (for painting) and the stored
    // preference (for the toggle icon) in the hook body, so the component calls a
    // zero-arg cycle() that advances relative to the live preference value.
    useThemePreference: () => {
      const mode = useThemeModeValue();
      const modePreference = useThemeModePreferenceValue();
      return {
        mode,
        modePreference,
        // cycle() reads the current preference in the presenter (not this render's
        // captured value), so rapid clicks each advance from the true state.
        cycle: () => {
          return presenters.themePreference.cycle();
        },
      };
    },
    useThemeSkinPreference: () => {
      return { skin: useThemeSkinValue(), setSkin: setThemeSkin };
    },
    useAnimatedBackground: () => {
      const enabled = useAnimatedBgValue();
      return {
        enabled,
        setEnabled: setAnimatedBg,
        toggle: () => {
          return presenters.animatedBackground.toggle(enabled);
        },
      };
    },
    useViewModePreference: () => {
      return {
        viewMode: useViewModeValue(),
        setViewMode,
      };
    },
    useCreditRfqFilterPreference: () => {
      return {
        filter: useCreditRfqFilterValue(),
        setFilter: setCreditRfqFilter,
      };
    },
    useEqWatchlistSort: () => {
      return {
        sort: useEqWatchlistSortValue(),
        setSort: setEqWatchlistSort,
        cycle: () => {
          presenters.eqWatchlistSortPreference.cycle();
        },
      };
    },
    useEqBlotterView: () => {
      return {
        view: useEqBlotterViewValue(),
        setView: setEqBlotterView,
      };
    },
    useSession: () => {
      return {
        state: useSessionState(),
        lock: lockSession,
        unlock: unlockSession,
      };
    },
    useBootGate: () => {
      return {
        visible: useBootGateVisible(),
        reboot: rebootHud,
        dismiss: dismissBootSplash,
      };
    },
    useRfqCountdown: (creationTimestamp: number, totalMs: number) => {
      return useMachine(() => {
        return createRfqCountdownMachine(creationTimestamp, totalMs);
      }).state;
    },
    useAnimationIntents,
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
    useWatchlist,
    useEquityQuote,
    useCandles,
    useDepth,
    useEquityOrders,
    useEquityPositions,
    useOrderTicket: (defaultSymbol: string) => {
      return useMachine(() => {
        return machines.orderTicket(defaultSymbol);
      });
    },
    useEqWorkspace: () => {
      return {
        state: useEqWorkspaceState(),
        select: selectEqSymbol,
        closeTab: closeEqTab,
        setTimeframe: setEqTimeframe,
      };
    },
    useMetrics: () => {
      return {
        throughput: useThroughputSamples(),
        latency: useLatencySamples(),
        errorRate: useErrorRateSamples(),
      };
    },
    useTopology: useTopologyValue,
    useEventLog: useEventLogValue,
    useSessions: useSessionsValue,
    useSessionCountSeries: useSessionCountSeriesValue,
    useIncident: () => {
      return {
        state: useIncidentState(),
        inject: injectIncident,
        clear: clearIncident,
      };
    },
  };
}
