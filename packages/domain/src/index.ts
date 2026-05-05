// FX
export type { CurrencyPair } from "./fx/currencyPair.js";
export { deriveBaseTerm, KNOWN_CURRENCY_PAIRS } from "./fx/currencyPair.js";

export type { PriceTick, Price } from "./fx/price.js";
export { PriceMovementType, calculateSpread, detectMovement, PRICE_HISTORY_SIZE } from "./fx/price.js";

export type { ExecutionRequest, Trade } from "./fx/trade.js";
export { Direction, TradeStatus, ExecutionStatus, deriveDealtCurrency, EXECUTION_TIMEOUT_MS, TOO_LONG_THRESHOLD_MS, CONFIRMATION_DISMISS_MS } from "./fx/trade.js";

export type { NotionalParseResult } from "./fx/notional.js";
export { parseNotional, isRfqRequired, validateNotional, DEFAULT_NOTIONAL, MAX_NOTIONAL, RFQ_THRESHOLD } from "./fx/notional.js";

export type { CurrencyCategory } from "./fx/currencyFilter.js";
export { CURRENCY_CATEGORIES, matchesCurrencyFilter } from "./fx/currencyFilter.js";

// Connection
export { ConnectionStatus, IDLE_TIMEOUT_MS, RECONNECT_INTERVAL_MS, nextConnectionStatus, mapGatewayStatus } from "./connection/connectionStatus.js";
export type { ConnectionEvent, GatewayStatus } from "./connection/connectionStatus.js";

// Analytics
export type { CurrencyPairPosition, HistoricPosition, PositionUpdates } from "./analytics/position.js";

// Credit
export type { Instrument } from "./credit/instrument.js";
export type { Dealer } from "./credit/dealer.js";
export { ADAPTIVE_BANK_NAME } from "./credit/dealer.js";
export type { Rfq } from "./credit/rfq.js";
export { RfqState, CREDIT_QUANTITY_MULTIPLIER, CREDIT_MAX_QUANTITY_INPUT } from "./credit/rfq.js";
export type { Quote, QuoteState } from "./credit/quote.js";
export { validQuoteTransitions } from "./credit/quote.js";
export type { CreditTrade } from "./credit/creditTrade.js";

// Ports
export type { ReferenceDataPort } from "./ports/referenceDataPort.js";
export type { PricingPort, RfqQuoteResult } from "./ports/pricingPort.js";
export type { ExecutionPort } from "./ports/executionPort.js";
export type { BlotterPort } from "./ports/blotterPort.js";
export type { AnalyticsPort } from "./ports/analyticsPort.js";
export type { InstrumentPort } from "./ports/instrumentPort.js";
export type { DealerPort } from "./ports/dealerPort.js";
export type { WorkflowPort, RfqEvent, CreateRfqRequest, QuoteRequest } from "./ports/workflowPort.js";
export type { ConnectionEventsPort } from "./ports/connectionEventsPort.js";

// Simulators (in-memory port implementations)
export {
  ReferenceDataSimulator,
  PricingSimulator,
  ExecutionSimulator,
  TradeStoreSimulator,
  AnalyticsSimulator,
  InstrumentSimulator,
  DealerSimulator,
  CreditRfqSimulator,
  INSTRUMENTS_CATALOG,
  DEALERS_CATALOG,
} from "./simulators/index.js";
export type { TradeListener } from "./simulators/index.js";

// Use Cases
export { PriceStreamUseCase, PriceHistoryUseCase, ExecuteTradeUseCase, AnalyticsUseCase, WorkflowEventStreamUseCase, reduceRfqEvent, CreateRfqUseCase, RFQ_DEFAULT_EXPIRY_SECS, ConnectionStatusUseCase, TradeBlotterUseCase, CurrencyPairsUseCase, InstrumentsUseCase, DealersUseCase, RfqQuoteUseCase } from "./usecases/index.js";
export type { ExecuteTradeInput, ExecuteTradeResult, RfqStreamState, CreateRfqInput } from "./usecases/index.js";
