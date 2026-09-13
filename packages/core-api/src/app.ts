import type {
  AdminPort,
  AnalyticsPort,
  AnomalyDetectorConfig,
  AuthPort,
  BlotterPort,
  ConnectionEventsPort,
  DealerPort,
  EventLogPort,
  ExecutionPort,
  InstrumentPort,
  MarketDataPort,
  MetricControl,
  OrderPort,
  PositionPort,
  PreferencesPort,
  PricingPort,
  ReferenceDataPort,
  ServiceHealthPort,
  SessionsPort,
  TelemetryPort,
  WorkflowPort,
} from "@rtc/domain";

import type {
  AuthGatedTransport,
  ColorSchemeSource,
  DockLayoutStore,
  JarvisPort,
  JarvisUsagePort,
  SessionStore,
} from "#/adapters";
import type { LayoutState, WorkspaceTab } from "#/layout";
import type { Machine, MachineFactories } from "#/machine";
import type {
  EqDrawingsIntents,
  EqDrawingsState,
  EqWorkspaceIntents,
  EqWorkspaceState,
  IncidentIntents,
  IncidentState,
  JarvisDemoMachineHandle,
  JarvisDriverMachineHandle,
  JarvisMachineHandle,
  LayoutIntents,
  WorkspaceNavIntents,
  WorkspaceNavState,
} from "#/machines/index";
import type {
  AmbientStylePresenter,
  AnalyticsPresenter,
  AnimatedBackgroundPresenter,
  AnimationDirector,
  AuthPresenter,
  BlotterPresenter,
  BootGatePresenter,
  BootPreferencePresenter,
  CandleSeriesPresenter,
  ChartSubstratePresenter,
  ConnectionStatusPresenter,
  CreditRfqFilterPreferencePresenter,
  CurrencyPairsPresenter,
  DealersPresenter,
  DepthPresenter,
  EqBlotterViewPreferencePresenter,
  EqWatchlistSortPreferencePresenter,
  ErrorRatePresenter,
  EventLogPresenter,
  ForceBootAnimationPresenter,
  InstrumentsPresenter,
  JarvisPanelsPresenter,
  JarvisPreferencesPresenter,
  JarvisUsagePresenter,
  LatencyPresenter,
  LayoutEnginePresenter,
  LoginWaitPreferencesPresenter,
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

export interface AppPorts {
  referenceData: ReferenceDataPort;
  pricing: PricingPort;
  execution: ExecutionPort;
  blotter: BlotterPort;
  analytics: AnalyticsPort;
  instruments: InstrumentPort;
  dealers: DealerPort;
  workflow: WorkflowPort;
  admin: AdminPort;
  preferences: PreferencesPort;
  /** J.A.R.V.I.S. chat backend — constructed internally by both port
   * factories, never platform-supplied. Simulator mode gets the scripted
   * (offline) brain (`ScriptedJarvisAdapter`); WS-real mode speaks the
   * `JARVIS_*` wire protocol over the live socket (`WsJarvisAdapter`). */
  jarvis: JarvisPort;
  /** Rolling Jarvis usage/cost telemetry (Admin surface) — constructed
   * internally by both port factories, never platform-supplied, mirroring
   * `jarvis` above. Simulator mode gets an always-empty snapshot; WS-real
   * mode streams `SERVER_MSG.ADMIN_JARVIS_USAGE` (`WsJarvisUsageAdapter`). */
  jarvisUsage: JarvisUsagePort;
  connectionEvents: ConnectionEventsPort;
  marketData: MarketDataPort;
  orders: OrderPort;
  positions: PositionPort;
  telemetry: TelemetryPort;
  serviceHealth: ServiceHealthPort;
  eventLog: EventLogPort;
  sessions: SessionsPort;
  auth: AuthPort;
  sessionStore: SessionStore;
  /** Perturbable controls passed to IncidentMachine — latency, errorRate, topology, eventLog sims. */
  metricControls: readonly MetricControl[];
  /** Auth-gated transport handle. Optional — the simulator branch has no
   * socket to gate, and omitting it leaves the gate inert. Supplied by the
   * WS-real branch so `createApp` opens the connection only once the user is
   * authenticated (and closes it on sign-out). */
  transport?: AuthGatedTransport;
  /** OS colour-scheme signal. Optional — omit in tests/simulators to default to light.
   * Browser implementation: `MediaQueryColorSchemeAdapter` (client-react). */
  colorScheme?: ColorSchemeSource;
  /** Per-tab persistence for the Dockview engine's serialized layout blob.
   * Optional — omitting it costs no fake-ports builder a change; `Presenters
   * .dockLayoutStore` falls back to a fresh `InMemoryDockLayoutStore` when
   * absent. Browser implementation: `LocalStorageDockLayoutStore`
   * (client-react). */
  dockLayoutStore?: DockLayoutStore;
  /** One-shot boot-splash decision, read once at composition time to seed the
   * BootGatePresenter. Optional — omit in tests/simulators to default to
   * playing the splash. Browser implementation: `shouldPlayBootSplash`
   * (client-react bootSplashGate — it reads navigator/location, which stays
   * out of this framework-free core). */
  bootSplash?: { shouldPlay(): boolean };
  /** Overrides `NarratorMachine`'s `detectAnomalies` thresholds — read once
   * at composition time and threaded straight through to
   * `createNarratorMachine`'s own `config`. Optional — `undefined` in
   * production (the detector runs at `DEFAULT_ANOMALY_CONFIG`). Both web
   * clients' `buildBrowserPorts.ts` supply the dev-only relaxed thresholds
   * (`?narratorThresholds=test`, `import.meta.env.DEV`-gated) here; nothing
   * else in the app sets it. */
  narratorConfig?: Partial<AnomalyDetectorConfig>;
}

export type TransportPorts = Omit<AppPorts, "connectionEvents">;

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
  ambientStyle: AmbientStylePresenter;
  chartSubstrate: ChartSubstratePresenter;
  layoutEngine: LayoutEnginePresenter;
  /** Per-tab persistence for the Dockview engine's serialized layout blob —
   * `ports.dockLayoutStore ?? new InMemoryDockLayoutStore()`. Consumed
   * through `useDockLayoutStore` as a plain passthrough (no rx: the store
   * itself is not a stream, just load/save). */
  dockLayoutStore: DockLayoutStore;
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
  /** The two login-wait inspection preferences (style pin + artificial delay). */
  loginWaitPreferences: LoginWaitPreferencesPresenter;
  /** The two Jarvis desk-assistant preferences (brain + thinking-effort budget). */
  jarvisPreferences: JarvisPreferencesPresenter;
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
  /** The app's active workspace tab — a composition-root singleton (mirrors
   * `eqWorkspace`/`incident` above), the promoted form of the
   * `useState<WorkspaceTab>` that used to live directly in each web client's
   * `App.tsx`, now reachable from composition (and therefore from Jarvis's
   * drive-the-app `switchTab` command — see the P5 `JarvisDriverMachine`,
   * composed alongside `jarvisPanels` below). */
  workspaceNav: Machine<WorkspaceNavState, WorkspaceNavIntents>;
  /** Per-tab layout view-model — a memoized composition-root SINGLETON (one
   * `Machine` instance per `WorkspaceTab`, built lazily on first request and
   * cached for the app's whole session), mirroring `eqWorkspace`/
   * `workspaceNav` above. Resolves the deferral Task 6's review recorded: a
   * driven `"layout"` DriveCommand used to mutate a throwaway per-call
   * instance nothing else ever read from (`layout` used to be a bare
   * factory, matching `MachineFactories.layout`'s OLD "fresh machine per
   * mount" contract — see `machine.ts`'s doc for the exception this field
   * is now the source of truth for). `createMachineFactories`'s own `layout`
   * field is a thin `(tab) => presenters.layoutFor(tab)` passthrough onto
   * THIS map, so the UI (via `useLayout`, consumed WITHOUT `useMachine`'s
   * dispose-on-unmount — see `createViewModel.ts`) and `jarvisDriver`'s
   * `layout` dep both read/write the exact same instance per tab. Named
   * consequence (accepted): layout state (maximized/collapsed/split sizes)
   * now SURVIVES a tab switch instead of resetting on `WorkspaceEngine`'s
   * `key={activeTab}` remount, since the underlying machine is no longer
   * rebuilt per mount. The returned instance's `dispose()` is a
   * STRUCTURAL no-op (not just a documented convention) — it exists as the
   * backstop for ANY future `useMachine`-style consumer that disposes on
   * unmount, so such a consumer can never tear down the shared singleton
   * for every other consumer. Both bindings' current `useLayout` already
   * read this singleton non-disposingly (solid-bindings via `toSignal`,
   * react-bindings likewise), so the no-op isn't load-bearing for either
   * today — it's defense-in-depth, not a workaround for a live caller. */
  layoutFor: (tab: WorkspaceTab) => Machine<LayoutState, LayoutIntents>;
  /** Equities: per-symbol chart annotations (trendlines/horizontal levels),
   * the active draw tool, and the current selection — shared by the chart
   * head's tool pills and the plot. */
  eqDrawings: Machine<EqDrawingsState, EqDrawingsIntents>;
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
  /** J.A.R.V.I.S. chat overlay: entries, skin, pending confirmation, phase.
   * Widened with `events$` (every turn's reply events) — Task 6's
   * `jarvisPanels` below is composed from it. */
  jarvis: JarvisMachineHandle;
  /** J.A.R.V.I.S. usage/cost telemetry (Admin surface) — null until the
   * first snapshot. */
  jarvisUsage: JarvisUsagePresenter;
  /** J.A.R.V.I.S. generative-UI desk panels: spawned/edited/dismissed via
   * `jarvis`'s own "panel" turn events, interpreted into live `PanelData`
   * over the domain ports. */
  jarvisPanels: JarvisPanelsPresenter;
  /** Dock a live desk panel into the workspace: the panels machine flips it
   * to `docked` (it owns every no-op rule — unknown id, already docked, the
   * docked cap), and ONLY if that actually changed does the ACTIVE tab's
   * layout machine gain a matching leaf. The tab is captured here, at dock
   * time: a docked panel belongs to the tab that was on screen when it was
   * docked, and stays with that tab until it is undocked, wherever the user
   * navigates in between. */
  dockPanel: (panelId: string) => void;
  /** Undock a docked desk panel — the exact inverse of `dockPanel`, removing
   * the leaf from the tab the panel was docked INTO (not whichever tab
   * happens to be active now). */
  undockPanel: (panelId: string) => void;
  /** Dismiss a desk panel — the DOCKED-SAFE dismissal, and the one both the
   * UI and the driver must use in place of `jarvisPanels.dismissPanel`.
   * Dismissing a docked panel through the raw presenter/machine intent
   * leaves its leaf stranded in the layout tree (an empty pane with no
   * removal control), lets the stored entry hand the panel back at the next
   * reload, and can push the persisted docked total past
   * `MAX_DOCKED_PANELS` — which makes the writer refuse every later write
   * for the session. This detaches the leaf first. */
  dismissPanel: (panelId: string) => void;
  /** Discard the whole persisted workspace: clears the stored preference,
   * resets every layout machine created this session back to its tab's
   * default tree, and dismisses every docked panel. */
  resetWorkspaceLayout: () => void;
  /** J.A.R.V.I.S. drive-the-app interpreter: turns `jarvis`'s own "command"
   * turn events into staggered intent dispatches on `workspaceNav`,
   * per-tab layout machines, `eqWorkspace`, the theme-skin/power-saver
   * preferences, and `jarvisPanels.dismissPanel` — see
   * `JarvisDriverMachine`'s doc for the total-interpreter/choreography
   * contract. */
  jarvisDriver: JarvisDriverMachineHandle;
  /** J.A.R.V.I.S. hands-free scripted demo — a session-lifetime composition
   * singleton (same no-dispose doctrine as `jarvisPanels`/`jarvisDriver`
   * above) that drives `jarvis`'s REAL `sendScripted`/`declineConfirmation`
   * intents through the fixed `JARVIS_DEMO_STEPS` script, one real
   * scripted-brain turn per step. See `JarvisDemoMachine`'s doc for the
   * settle-detection design (correlated via `jarvis.state$`'s `entries`
   * PLUS the raw `jarvis.events$` terminal event — narrator-turn-safe and
   * able to tell an errored turn from a done one, which `entries` alone
   * cannot). */
  jarvisDemo: JarvisDemoMachineHandle;
}

export interface AppCommands {
  /** Push a user-initiated reconnect intent (wired to reconnect$ in composition). */
  reconnect(): void;
}

export interface App {
  presenters: Presenters;
  ports: AppPorts;
  commands: AppCommands;
  /** Release everything the core owns (fibers, timers, subscriptions). No-op
   * for the RxJS core, abort for the async core, ManagedRuntime.dispose()
   * for the Effect core. Idempotent. */
  dispose(): Promise<void>;
}

/** The whole plug: what a client's `selectCore` returns. */
export interface CoreFactory {
  createApp(ports: AppPorts): App;
  createMachineFactories(presenters: Presenters): MachineFactories;
}
