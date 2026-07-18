// Auth

export { DEFAULT_AUTH_TTL_MS } from "./auth/authTtl.js";
export type { RosterEntry } from "./auth/roster.js";
export { findRosterUser, ROSTER } from "./auth/roster.js";
export type { SessionUser } from "./auth/sessionUser.js";

// FX

export type { CurrencyPositionNode } from "./analytics/aggregatePositions.js";
export {
  aggregatePositionsByCurrency,
  POSITION_MAX_RADIUS,
  POSITION_MIN_RADIUS,
} from "./analytics/aggregatePositions.js";
export {
  formatPnlHeadline,
  formatPnlK,
} from "./analytics/formatPnlHeadline.js";
export { formatPnlValue } from "./analytics/formatPnlValue.js";
export type { Scale } from "./analytics/formatScale.js";
export {
  formatPrecise2,
  formatWithScale,
  scaleNumber,
} from "./analytics/formatScale.js";
export type { CurrencyExposure } from "./analytics/netExposure.js";
export { netExposureByCurrency } from "./analytics/netExposure.js";
// Analytics
export type {
  CurrencyPairPosition,
  HistoricPosition,
  PositionUpdates,
} from "./analytics/position.js";
export type {
  ConnectionEvent,
  GatewayStatus,
} from "./connection/connectionStatus.js";
// Connection
export {
  ConnectionStatus,
  IDLE_TIMEOUT_MS,
  mapGatewayStatus,
  nextConnectionStatus,
  RECONNECT_INTERVAL_MS,
} from "./connection/connectionStatus.js";
export type { CreditTrade } from "./credit/creditTrade.js";
export type { Dealer } from "./credit/dealer.js";
export { ADAPTIVE_BANK_NAME } from "./credit/dealer.js";
// Credit
export type { Instrument } from "./credit/instrument.js";
export type { Quote, QuoteState } from "./credit/quote.js";
export { validQuoteTransitions } from "./credit/quote.js";
export type { Rfq } from "./credit/rfq.js";
export {
  applyMaximum,
  CREDIT_MAX_QUANTITY_INPUT,
  CREDIT_QUANTITY_MULTIPLIER,
  CREDIT_RFQ_EXPIRY_SECONDS,
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
export type { EquityQuote } from "./equities/quote.js";
export type { CandleTimeframe } from "./equities/timeframe.js";
export { CANDLE_TIMEFRAMES } from "./equities/timeframe.js";
export type { CurrencyCategory } from "./fx/currencyFilter.js";
export {
  CURRENCY_CATEGORIES,
  matchesCurrencyFilter,
} from "./fx/currencyFilter.js";
export type { CurrencyPair } from "./fx/currencyPair.js";
export { deriveBaseTerm, KNOWN_CURRENCY_PAIRS } from "./fx/currencyPair.js";
export type { NotionalParseResult } from "./fx/notional.js";
export {
  DEFAULT_NOTIONAL,
  isRfqRequired,
  MAX_NOTIONAL,
  parseNotional,
  RFQ_THRESHOLD,
  validateNotional,
} from "./fx/notional.js";
export type { Price, PriceTick } from "./fx/price.js";
export {
  calculateSpread,
  detectMovement,
  PRICE_HISTORY_SIZE,
  PriceMovementType,
} from "./fx/price.js";
export type { ExecutionRequest, Trade } from "./fx/trade.js";
export {
  CONFIRMATION_DISMISS_MS,
  Direction,
  deriveDealtCurrency,
  EXECUTION_TIMEOUT_MS,
  ExecutionStatus,
  REJECTED_DISPLAY_MS,
  RFQ_TIMEOUT_MS,
  TOO_LONG_THRESHOLD_MS,
  TradeStatus,
} from "./fx/trade.js";
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
export type {
  BootVariant,
  CreditRfqFilter,
  EqBlotterView,
  EqWatchlistSort,
  ThemeMode,
  ThemeModePreference,
  ThemeSkin,
  ViewMode,
} from "./preferences/preferences.js";
export {
  BOOT_VARIANTS,
  DEFAULT_ANIMATED_BACKGROUND,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_CREDIT_RFQ_FILTER,
  DEFAULT_EQ_BLOTTER_VIEW,
  DEFAULT_EQ_WATCHLIST_SORT,
  DEFAULT_FORCE_BOOT_ANIMATION,
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_MODE_PREFERENCE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  EQ_WATCHLIST_SORTS,
  nextEqWatchlistSort,
  nextThemeModePreference,
  resolveThemeMode,
  THEME_MODE_PREFERENCES,
  THEME_MODES,
  THEME_SKINS,
} from "./preferences/preferences.js";
export type {
  EquityOrderDeps,
  FillEvent,
  MetricControl,
  OrderListener,
  Perturbation,
  PreferencesSeed,
  TradeListener,
} from "./simulators/index.js";
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
  EquityOrderSimulator,
  EquityPositionSimulator,
  ErrorRateSimulator,
  EventLogSimulator,
  ExecutionSimulator,
  gbmStep,
  INSTRUMENTS_CATALOG,
  InstrumentSimulator,
  LatencySimulator,
  PreferencesSimulator,
  PricingSimulator,
  ReferenceDataSimulator,
  rfqResponseDelayMs,
  ServiceTopologySimulator,
  SessionSimulator,
  TelemetrySimulator,
  ThroughputSimulator,
  TradeStoreSimulator,
} from "./simulators/index.js";
// Telemetry
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
export type {
  CreateRfqInput,
  ExecuteTradeInput,
  ExecuteTradeResult,
  RfqStreamState,
} from "./usecases/index.js";
// Use Cases
export {
  AnalyticsUseCase,
  ConnectionStatusUseCase,
  CreateRfqUseCase,
  CurrencyPairsUseCase,
  DealersUseCase,
  ExecuteTradeUseCase,
  InstrumentsUseCase,
  PriceHistoryUseCase,
  PriceStreamUseCase,
  RFQ_DEFAULT_EXPIRY_SECS,
  RfqQuoteUseCase,
  reduceRfqEvent,
  TradeBlotterUseCase,
  WorkflowEventStreamUseCase,
} from "./usecases/index.js";
