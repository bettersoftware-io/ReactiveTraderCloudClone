// Framework-neutral snapshot of everything the UI reads through ViewModel.
// No React/Solid imports — this file (and the rest of shared/) is the
// portable core shared by every UI implementation.

import type {
  ActivityEntry,
  IncidentKind,
  NotionalView,
  OrderTicketState,
  RfqState,
  RfqSubmissionState,
  ThroughputView,
  TicketSubmissionState,
  TileExecutionState,
} from "@rtc/client-core";
import {
  type Candle,
  ConnectionStatus,
  type CurrencyPair,
  type Dealer,
  type DepthBook,
  type EquityInstrument,
  type EquityOrder,
  type EquityPosition,
  type EquityQuote,
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
  /** NewRfqForm submission state (useRfqSubmission); defaults to "editing". */
  rfqSubmission?: RfqSubmissionState;
  /** TradeTicket submission state (useTicketSubmission); defaults to not submitted. */
  ticketSubmission?: TicketSubmissionState;
  /** Throughput control view (useThroughput); defaults to a loaded value of 100. */
  throughput?: ThroughputView;
  /** Theme-mode preference (useThemePreference); defaults to DEFAULT_THEME_MODE ("dark"). */
  themeMode?: ThemeModePreference;
  /** Theme-skin preference (useThemeSkinPreference); defaults to "classic" in the fakes. */
  themeSkin?: ThemeSkin;
  /** Animated-background preference (useAnimatedBackground); defaults to false. */
  animatedBackground?: boolean;
  /** Live-rates view-mode preference (useViewModePreference); defaults to DEFAULT_VIEW_MODE ("chart"). */
  viewMode?: ViewMode;
  /** Session lock state (useSession); defaults to false → LockScreen renders nothing. */
  sessionLocked?: boolean;
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
