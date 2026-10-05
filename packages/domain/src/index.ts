// Auth

export { DEFAULT_AUTH_TTL_MS } from "./auth/authTtl.js";
export {
  type DemoAccount,
  listDemoAccounts,
  sharedDemoPassword,
} from "./auth/demoAccounts.js";
export { findRosterUser, ROSTER, type RosterEntry } from "./auth/roster.js";
export type { SessionUser } from "./auth/sessionUser.js";

// FX

// FX

export {
  aggregatePositionsByCurrency,
  type CurrencyPositionNode,
  POSITION_MAX_RADIUS,
  POSITION_MIN_RADIUS,
} from "./analytics/aggregatePositions.js";
export {
  formatPnlHeadline,
  formatPnlK,
} from "./analytics/formatPnlHeadline.js";
export { formatPnlValue } from "./analytics/formatPnlValue.js";
export {
  formatPrecise2,
  formatWithScale,
  type Scale,
  scaleNumber,
} from "./analytics/formatScale.js";
export {
  type CurrencyExposure,
  netExposureByCurrency,
} from "./analytics/netExposure.js";
// Analytics
export type {
  CurrencyPairPosition,
  HistoricPosition,
  PositionUpdates,
} from "./analytics/position.js";
// Boot
export { BOOT_DURATION_MS, BOOT_TICK_MS } from "./boot/bootCadence.js";
// Connection
export {
  type ConnectionEvent,
  ConnectionStatus,
  type GatewayStatus,
  IDLE_TIMEOUT_MS,
  mapGatewayStatus,
  nextConnectionStatus,
  RECONNECT_INTERVAL_MS,
} from "./connection/connectionStatus.js";
export type { CreditTrade } from "./credit/creditTrade.js";
export { ADAPTIVE_BANK_NAME, type Dealer } from "./credit/dealer.js";
// Credit
export type { Instrument } from "./credit/instrument.js";
export {
  type Quote,
  type QuoteState,
  validQuoteTransitions,
} from "./credit/quote.js";
export {
  applyMaximum,
  CREDIT_MAX_QUANTITY_INPUT,
  CREDIT_QUANTITY_MULTIPLIER,
  CREDIT_RFQ_EXPIRY_SECONDS,
  RFQ_REDIRECT_DELAY_MS,
  type Rfq,
  RfqState,
} from "./credit/rfq.js";
// Equities
export type { Candle } from "./equities/candle.js";
export type { DepthBook, DepthLevel } from "./equities/depth.js";
export type { EquityInstrument } from "./equities/instrument.js";
export type {
  EquityOrder,
  OrderSide,
  OrderStatus,
  OrderType,
} from "./equities/order.js";
export type { EquityPosition } from "./equities/position.js";
export {
  EQUITY_PRICE_HISTORY_SIZE,
  type EquityQuote,
} from "./equities/quote.js";
export {
  CANDLE_DEFAULT_VISIBLE,
  CANDLE_HISTORY_DEPTH_MAX,
  CANDLE_HISTORY_PAGE,
  CANDLE_HISTORY_RETRY_COOLDOWN_MS,
  CANDLE_HISTORY_TOTAL,
  CANDLE_TIMEFRAMES,
  type CandleTimeframe,
} from "./equities/timeframe.js";
export {
  CURRENCY_CATEGORIES,
  type CurrencyCategory,
  matchesCurrencyFilter,
} from "./fx/currencyFilter.js";
export {
  type CurrencyPair,
  deriveBaseTerm,
  KNOWN_CURRENCY_PAIRS,
} from "./fx/currencyPair.js";
export {
  DEFAULT_NOTIONAL,
  isRfqRequired,
  MAX_NOTIONAL,
  type NotionalParseResult,
  parseNotional,
  RFQ_THRESHOLD,
  validateNotional,
} from "./fx/notional.js";
export {
  calculateSpread,
  detectMovement,
  PRICE_CONFLATION_MS,
  PRICE_HISTORY_CONFLATION_MS,
  PRICE_HISTORY_SIZE,
  type Price,
  PriceMovementType,
  type PriceTick,
} from "./fx/price.js";
export {
  ACTIVITY_FEED_CAP,
  BLOTTER_ROW_HIGHLIGHT_MS,
  CONFIRMATION_DISMISS_MS,
  Direction,
  deriveDealtCurrency,
  EXECUTION_TIMEOUT_MS,
  type ExecutionRequest,
  ExecutionStatus,
  REJECTED_DISPLAY_MS,
  RFQ_COUNTDOWN_INTERVAL_MS,
  RFQ_TIMEOUT_MS,
  TOO_LONG_THRESHOLD_MS,
  type Trade,
  TradeStatus,
} from "./fx/trade.js";
// Jarvis
export {
  type AnomalyDetectorConfig,
  type AnomalyEvent,
  createAnomalyDetector,
  DEFAULT_ANOMALY_CONFIG,
  detectAnomalies,
} from "./jarvis/anomalyDetector.js";
export {
  DRIVE_CHART_TYPES,
  DRIVE_COMMAND_KINDS,
  DRIVE_INDICATORS,
  DRIVE_LAYOUT_OPS,
  DRIVE_PANES,
  DRIVE_POWER_LEVELS,
  DRIVE_SKINS,
  DRIVE_TABS,
  DRIVE_TIMEFRAMES,
  type DriveBatchV1,
  type DriveCommandV1,
  type DriveTab,
} from "./jarvis/driveCommand.js";
export {
  DEMO_STEP_BEAT_MS,
  DEMO_STEP_TIMEOUT_MS,
  JARVIS_CONFIRM_TIMEOUT_MS,
  JARVIS_GREETING,
  JARVIS_NARRATION_PREFIX,
  MAX_NARRATIONS_PER_SESSION,
  NARRATION_COOLDOWN_MS,
} from "./jarvis/jarvisConstants.js";
export type {
  JarvisAvailabilityGate,
  JarvisEvent,
  JarvisGateLevel,
  JarvisHistoryEntry,
} from "./jarvis/jarvisEvent.js";
export type {
  JarvisBrainUsageRow,
  JarvisUsage,
  JarvisUsageSnapshot,
} from "./jarvis/jarvisUsage.js";
export {
  PANEL_ANNOTATION_KINDS,
  PANEL_ANNOTATION_TONES,
  PANEL_SOURCE_KINDS,
  PANEL_TOPN_BY_VALUES,
  PANEL_TRANSFORM_KINDS,
  PANEL_VIZ_KINDS,
  type PanelAnnotation,
  type PanelAnnotationTone,
  type PanelSource,
  type PanelSpecV1,
  type PanelTransform,
  type PanelViz,
} from "./jarvis/panelSpec.js";
export type { AdminPort } from "./ports/adminPort.js";
export type { AnalyticsPort } from "./ports/analyticsPort.js";
export type { AuthOutcome, AuthPort } from "./ports/authPort.js";
export type { BlotterPort } from "./ports/blotterPort.js";
export type { ConnectionEventsPort } from "./ports/connectionEventsPort.js";
export type { DealerPort } from "./ports/dealerPort.js";
export type { EventLogPort } from "./ports/eventLogPort.js";
export type { ExecutionPort } from "./ports/executionPort.js";
export type { InstrumentPort } from "./ports/instrumentPort.js";
// Ports
export type { MarketDataPort } from "./ports/marketDataPort.js";
export type { OrderPort, PlaceOrderRequest } from "./ports/orderPort.js";
export type { PositionPort } from "./ports/positionPort.js";
export type { PreferencesPort } from "./ports/preferencesPort.js";
export type { PricingPort, RfqQuoteResult } from "./ports/pricingPort.js";
export type { ReferenceDataPort } from "./ports/referenceDataPort.js";
export type { ServiceHealthPort } from "./ports/serviceHealthPort.js";
export type { SessionsPort } from "./ports/sessionsPort.js";
export type { TelemetryPort } from "./ports/telemetryPort.js";
export type {
  CreateRfqRequest,
  QuoteRequest,
  RfqEvent,
  WorkflowPort,
} from "./ports/workflowPort.js";
// Preferences
// NOTE: `workspaceLayoutV1` (see PreferencesPort) has no type alias or
// DEFAULT_*/roster constant to barrel here — see preferences.ts's block
// comment above ChartSubstrate for why.
export {
  AMBIENT_STYLES,
  type AmbientStyle,
  BOOT_VARIANTS,
  type BootVariant,
  CHART_SUBSTRATES,
  type ChartSubstrate,
  type CreditRfqFilter,
  DEFAULT_AMBIENT_STYLE,
  DEFAULT_ANIMATED_BACKGROUND,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_CHART_SUBSTRATE,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_FORCE_BOOT_ANIMATION,
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  DEFAULT_JARVIS_NARRATOR,
  DEFAULT_JARVIS_SKIN,
  DEFAULT_LAYOUT_ENGINE,
  DEFAULT_LOGIN_WAIT_DELAY,
  DEFAULT_LOGIN_WAIT_STYLE,
  DEFAULT_LOGIN_WAIT_VARIANT,
  DEFAULT_POWER_SAVER_LEVEL,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  EQ_WATCHLIST_SORTS,
  type EqBlotterView,
  type EqWatchlistSort,
  isJarvisBrain,
  isJarvisEffort,
  isJarvisNarratorPreference,
  isPowerSaverLevel,
  JARVIS_BRAIN_LABELS,
  JARVIS_BRAINS,
  JARVIS_EFFORTS,
  JARVIS_NARRATOR_PREFERENCES,
  JARVIS_SKINS,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisNarratorPreference,
  type JarvisSkin,
  LAYOUT_ENGINES,
  type LayoutEngine,
  LOGIN_WAIT_DELAY_MS,
  LOGIN_WAIT_DELAYS,
  LOGIN_WAIT_STYLES,
  LOGIN_WAIT_VARIANTS,
  type LoginWaitDelay,
  type LoginWaitStyle,
  type LoginWaitVariant,
  nextEqWatchlistSort,
  nextPowerSaverLevel,
  nextThemeModePreference,
  POWER_SAVER_LEVELS,
  type PowerSaverLevel,
  resolveThemeMode,
  THEME_MODE_PREFERENCES,
  THEME_MODES,
  THEME_SKINS,
  type ThemeMode,
  type ThemeModePreference,
  type ThemeSkin,
  type ViewMode,
} from "./preferences/preferences.js";
// Simulators (in-memory port implementations)
export {
  AnalyticsSimulator,
  AuthSimulator,
  aggregateCandle,
  ConnectionEventsSimulator,
  CreditRfqSimulator,
  DEALERS_CATALOG,
  DEFAULT_TRADER_NAME,
  DealerSimulator,
  type DevCredentials,
  EquityMarketDataSimulator,
  type EquityOrderDeps,
  EquityOrderSimulator,
  EquityPositionSimulator,
  ErrorRateSimulator,
  EventLogSimulator,
  ExecutionSimulator,
  type FillEvent,
  gbmStep,
  INSTRUMENTS_CATALOG,
  InstrumentSimulator,
  LatencySimulator,
  type MetricControl,
  type OrderListener,
  type Perturbation,
  type PreferencesSeed,
  PreferencesSimulator,
  PricingSimulator,
  ReferenceDataSimulator,
  rfqResponseDelayMs,
  ServiceTopologySimulator,
  SessionSimulator,
  TelemetrySimulator,
  ThroughputSimulator,
  type TradeListener,
  TradeStoreSimulator,
} from "./simulators/index.js";
// Telemetry
export {
  DEFAULT_THROUGHPUT,
  MAX_LOG_ROWS,
  METRIC_WINDOW,
  THROUGHPUT_DEBOUNCE_MS,
  THROUGHPUT_MESSAGE_DISMISS_MS,
} from "./telemetry/adminCadence.js";
export type { LogEvent, Severity } from "./telemetry/log.js";
export type { MetricSample } from "./telemetry/metrics.js";
export { mulberry32 } from "./telemetry/prng.js";
export type { SessionInfo } from "./telemetry/session.js";
export type {
  ServiceEdge,
  ServiceName,
  ServiceNode,
  ServiceStatus,
  ServiceTopology,
} from "./telemetry/topology.js";
// Use Cases
export {
  AnalyticsUseCase,
  ConnectionStatusUseCase,
  type CreateRfqInput,
  CreateRfqUseCase,
  CurrencyPairsUseCase,
  createEmptyRfqStreamState,
  DealersUseCase,
  EquityPriceHistoryUseCase,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  ExecuteTradeUseCase,
  InstrumentsUseCase,
  PriceHistoryUseCase,
  PriceStreamUseCase,
  RFQ_DEFAULT_EXPIRY_SECS,
  RfqQuoteUseCase,
  type RfqStreamState,
  reduceRfqEvent,
  TradeBlotterUseCase,
  WorkflowEventStreamUseCase,
} from "./usecases/index.js";
export {
  DRIVE_STAGGER_MS,
  MAX_DOCKED_PANELS,
  MAX_LAYOUT_PRESETS,
  MAX_LIVE_PANELS,
  MAX_PANEL_INSTANCES,
  WORKSPACE_PERSIST_DEBOUNCE_MS,
} from "./workspace/workspaceLimits.js";
