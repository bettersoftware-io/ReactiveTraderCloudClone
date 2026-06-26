// FX

export type { CurrencyPositionNode } from "./analytics/aggregatePositions.js";
export {
  aggregatePositionsByCurrency,
  POSITION_MAX_RADIUS,
  POSITION_MIN_RADIUS,
} from "./analytics/aggregatePositions.js";
export { formatPnlValue } from "./analytics/formatPnlValue.js";
export type { Scale } from "./analytics/formatScale.js";
export {
  formatPrecise2,
  formatWithScale,
  scaleNumber,
} from "./analytics/formatScale.js";
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
export type { BlotterPort } from "./ports/blotterPort.js";
export type { ConnectionEventsPort } from "./ports/connectionEventsPort.js";
export type { DealerPort } from "./ports/dealerPort.js";
export type { ExecutionPort } from "./ports/executionPort.js";
export type { InstrumentPort } from "./ports/instrumentPort.js";
export type { PreferencesPort } from "./ports/preferencesPort.js";
export type { PricingPort, RfqQuoteResult } from "./ports/pricingPort.js";
// Ports
export type { ReferenceDataPort } from "./ports/referenceDataPort.js";
export type {
  CreateRfqRequest,
  QuoteRequest,
  RfqEvent,
  WorkflowPort,
} from "./ports/workflowPort.js";
// Preferences
export type {
  ThemeMode,
  ThemeSkin,
  ViewMode,
} from "./preferences/preferences.js";
export {
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_SKIN,
  DEFAULT_VIEW_MODE,
  THEME_MODES,
  THEME_SKINS,
} from "./preferences/preferences.js";
export type { PreferencesSeed, TradeListener } from "./simulators/index.js";
// Simulators (in-memory port implementations)
export {
  AnalyticsSimulator,
  ConnectionEventsSimulator,
  CreditRfqSimulator,
  DEALERS_CATALOG,
  DealerSimulator,
  ExecutionSimulator,
  INSTRUMENTS_CATALOG,
  InstrumentSimulator,
  PreferencesSimulator,
  PricingSimulator,
  ReferenceDataSimulator,
  rfqResponseDelayMs,
  ThroughputSimulator,
  TradeStoreSimulator,
} from "./simulators/index.js";
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
