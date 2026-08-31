// Framework-neutral snapshot of everything the UI reads through ViewModel.
// No React/Solid imports — this file (and the rest of shared/) is the
// portable core shared by every UI implementation.

import type {
  ActivityEntry,
  EqWorkspaceState,
  IncidentKind,
  JarvisState,
  JarvisUsageSnapshot,
  NotionalView,
  OrderTicketState,
  PanelData,
  PanelId,
  PanelStatus,
  RfqState,
  RfqSubmissionState,
  ThroughputView,
  TicketSubmissionState,
  TileExecutionState,
} from "@rtc/client-core";
import {
  type AmbientStyle,
  type Candle,
  ConnectionStatus,
  type CreditRfqFilter,
  type CurrencyPair,
  type Dealer,
  type DepthBook,
  type EqBlotterView,
  type EquityInstrument,
  type EquityOrder,
  type EquityPosition,
  type EquityQuote,
  type EqWatchlistSort,
  type Instrument,
  type LayoutEngine,
  type LogEvent,
  type LoginWaitVariant,
  type MetricSample,
  type PositionUpdates,
  type PowerSaverLevel,
  type Price,
  type PriceTick,
  type Quote,
  type Rfq,
  type ServiceTopology,
  type SessionInfo,
  type ThemeModePreference,
  type ThemeSkin,
  type Trade,
  type ViewMode,
} from "@rtc/domain";

export interface AppData {
  prices: Record<string, Price | null>;
  priceHistory: Record<string, readonly PriceTick[]>;
  trades: readonly Trade[];
  /** Ids the blotter should flag as newly arrived (useNewTradeIds); defaults to none. */
  newTradeIds?: ReadonlySet<number>;
  /** Live-executed entries for the Activity tab (useActivity); defaults to []. */
  activity?: readonly ActivityEntry[];
  analytics: PositionUpdates | null;
  rfqs: readonly Rfq[];
  quotesForRfq: Record<number, readonly Quote[]>;
  allQuotes: ReadonlyMap<number, Quote>;
  currencyPairs: readonly CurrencyPair[];
  instruments: readonly Instrument[];
  dealers: readonly Dealer[];
  connectionStatus: ConnectionStatus;
  /** Per-symbol tile execution overlay state; a missing key defaults to "ready". */
  tileExecution: Record<string, TileExecutionState>;
  /** Per-symbol RFQ tile state; a missing key defaults to "init". */
  rfqTile: Record<string, RfqState>;
  /** Per-symbol stale flag for tiles (useStaleFlag); a missing key defaults to false. */
  stale: Record<string, boolean>;
  /** Stale flag for the analytics panel (useAnalyticsStaleFlag); defaults to false. */
  analyticsStale?: boolean;
  /** Notional view override for TileNotional screenshots; defaults to formatted defaultNotional. */
  notional?: NotionalView;
  /** NewRfqPanel submission state (useRfqSubmission); defaults to "editing". */
  rfqSubmission?: RfqSubmissionState;
  /** TradeTicket submission state (useTicketSubmission); defaults to not submitted. */
  ticketSubmission?: TicketSubmissionState;
  /** Throughput control view (useThroughput); defaults to a loaded value of 100. */
  throughput?: ThroughputView;
  /** Theme-mode preference (useThemePreference); defaults to DEFAULT_THEME_MODE ("dark"). */
  themeMode?: ThemeModePreference;
  /** Theme-skin preference (useThemeSkinPreference); defaults to "classic" in the fakes. */
  themeSkin?: ThemeSkin;
  /** Ambient-style preference (useAmbientStyle); defaults to "rays" in the fakes
   * (NOT the app's "aurora" default — see DEFAULT_AMBIENT_STYLE_FOR_FIXTURES in
   * each client's buildFakeViewModel.ts). */
  ambientStyle?: AmbientStyle;
  /** Animated-background preference (useAnimatedBackground); defaults to false. */
  animatedBackground?: boolean;
  /** Force-boot-animation preference (useForceBootAnimation); defaults to
   * DEFAULT_FORCE_BOOT_ANIMATION (true) in the fakes, matching the app. A
   * fixture opts into the non-default "off" explicitly (see "boot" in
   * fixtures.ts) when it needs reduced-motion's suppression to actually take
   * effect — forced play overrides it otherwise. */
  forceBootAnimation?: boolean;
  /** Power-saver master-override level (usePowerSaver); defaults to "off". */
  powerSaverLevel?: PowerSaverLevel;
  /** Layout-engine preference (useLayoutEngine); defaults to
   * DEFAULT_LAYOUT_ENGINE ("inhouse"). `"dockview"` mounts the real
   * DockviewLayoutEngine bridge over the fixture's panels — see the
   * `app/*-dockview` scenarios. */
  layoutEngine?: LayoutEngine;
  /** The layout machine's `maximized` panel, seeded into the fake
   * `useLayout`'s otherwise-default arrangement; defaults to null. The visual
   * host's layout intents are no-ops (a static snapshot per capture), so a
   * maximized/collapsed workspace is a FIXTURE, not a click — the same way
   * the component-level `layout/fx-*` scenarios seed a LayoutState. */
  layoutMaximized?: PanelId | null;
  /** The layout machine's `collapsed` set, seeded likewise; defaults to []. */
  layoutCollapsed?: readonly PanelId[];
  /** Live-rates view-mode preference (useViewModePreference); defaults to DEFAULT_VIEW_MODE ("chart"). */
  viewMode?: ViewMode;
  /** Credit RFQs panel filter preference (useCreditRfqFilterPreference); defaults to DEFAULT_CREDIT_RFQ_FILTER ("live"). */
  creditRfqFilter?: CreditRfqFilter;
  /** Session lock state (useAuth's `state.locked`); defaults to false → LockScreen renders nothing. */
  sessionLocked?: boolean;
  /** Unlock-in-flight state (useAuth's `state.unlocking`); defaults to false. */
  sessionUnlocking?: boolean;
  /** Sign-in-in-flight state (useAuth's `state.status === "authenticating"`);
   * defaults to false → LoginScreen renders the idle sign-in form. */
  sessionAuthenticating?: boolean;
  /** Login-wait treatment (useAuth's `state.waitVariant`); only visible while
   * sessionAuthenticating or sessionUnlocking is true. Defaults to "handshake". */
  waitVariant?: LoginWaitVariant;
  // ── Admin / telemetry fields (Phase 5) ───────────────────────────────────
  /** Metric windows for the radial gauges / charts (useMetrics); defaults to empty series. */
  adminMetrics?: {
    throughput: readonly MetricSample[];
    latency: readonly MetricSample[];
    errorRate: readonly MetricSample[];
  };
  /** Service topology graph (useTopology); defaults to null. */
  adminTopology?: ServiceTopology | null;
  /** Event log entries (useEventLog); defaults to []. */
  adminEventLog?: readonly LogEvent[];
  /** Active trader sessions (useSessions); defaults to []. */
  adminSessions?: readonly SessionInfo[];
  /** Rolling session-count series for the Active Sessions KPI card
   * (useSessionCountSeries); defaults to []. */
  adminSessionCountSeries?: readonly MetricSample[];
  /** Incident machine state (useIncident); defaults to { active: [] }. */
  adminIncident?: { active: readonly IncidentKind[] };
  // ── Equities fields (Phase 4) ─────────────────────────────────────────────
  /** Watchlist of equity instruments (useWatchlist); defaults to []. */
  equityWatchlist?: readonly EquityInstrument[];
  /** Per-symbol equity quote (useEquityQuote); a missing key returns null. */
  equityQuotes?: Record<string, EquityQuote>;
  /** Per-symbol candle series (useCandles); a missing key returns []. */
  equityCandles?: Record<string, readonly Candle[]>;
  /** Per-symbol depth book (useDepth); a missing key returns null. */
  equityDepth?: Record<string, DepthBook>;
  /** All equity orders (useEquityOrders); defaults to []. */
  equityOrders?: readonly EquityOrder[];
  /** All equity positions (useEquityPositions); defaults to []. */
  equityPositions?: readonly EquityPosition[];
  /** Order ticket state (useOrderTicket) — overrides the default editing stub. */
  equityOrderTicket?: OrderTicketState;
  /** Eq workspace state (useEqWorkspace) — selected symbol / open tabs /
   * timeframe; defaults to { sel: "", openTabs: [], timeframe: "1D" }. */
  equityWorkspace?: EqWorkspaceState;
  /** Watchlist sort-mode preference (useEqWatchlistSort); defaults to DEFAULT_EQ_WATCHLIST_SORT ("chg"). */
  eqWatchlistSort?: EqWatchlistSort;
  /** Blotter tab preference (useEqBlotterView); defaults to DEFAULT_EQ_BLOTTER_VIEW ("orders"). */
  eqBlotterView?: EqBlotterView;
  // ── J.A.R.V.I.S fields (Phase 1) ──────────────────────────────────────────
  /** Full useJarvis() state snapshot (JarvisOrb / JarvisOverlay); defaults to
   * the machine's closed/no-unread/idle/greeting-only INITIAL state. Intents
   * are always no-ops in the visual fakes — see buildFakeViewModel.ts. */
  jarvis?: JarvisState;
  /** Jarvis token-usage/cost telemetry (useJarvisUsage; JarvisUsageCard,
   * Task 10 of Phase 3); defaults to null (the card's "NO USAGE DATA"
   * placeholder) — routed alongside `jarvis` above so a fixture that seeds
   * this actually reaches the card instead of silently capturing empty. */
  jarvisUsage?: JarvisUsageSnapshot | null;
  /** Generative-UI desk panels J.A.R.V.I.S. has spawned (useJarvisPanels;
   * `JarvisPanelLayer`, Task 10 of the generative-UI round) — defaults to
   * none (the layer renders null). Each entry mirrors `JarvisPanelVm`'s
   * chrome fields MINUS `data$`: the visual fakes route a panel's rendered
   * BODY through `jarvisPanelData` below (keyed by panelId) instead of an
   * Observable, since `useJarvisPanelData(panelId)` is read directly with no
   * stream involved in a static screenshot. */
  jarvisPanels?: readonly {
    readonly panelId: string;
    readonly title: string;
    readonly rationale: string | null;
    readonly status: PanelStatus;
    readonly vizKind: PanelData["kind"] | null;
    /** Mirrors `JarvisPanelVm.docked` — optional here (defaults to `false`
     * in both fake-VM builders) since most fixtures never exercise a docked
     * panel. */
    readonly docked?: boolean;
  }[];
  /** Per-panelId rendered body (useJarvisPanelData), paired with
   * `jarvisPanels` above; a missing key returns null (the layer's
   * "Connecting…" placeholder). */
  jarvisPanelData?: Record<string, PanelData>;
}

/** A fully-populated empty baseline; fixtures override only what they exercise. */
const defaultAppData: AppData = {
  prices: {},
  priceHistory: {},
  trades: [],
  analytics: null,
  rfqs: [],
  quotesForRfq: {},
  allQuotes: new Map(),
  currencyPairs: [],
  instruments: [],
  dealers: [],
  connectionStatus: ConnectionStatus.CONNECTED,
  tileExecution: {},
  rfqTile: {},
  stale: {},
};

/** Shallow-merge a partial fixture over the baseline. */
export function makeAppData(overrides: Partial<AppData>): AppData {
  return { ...defaultAppData, ...overrides };
}
