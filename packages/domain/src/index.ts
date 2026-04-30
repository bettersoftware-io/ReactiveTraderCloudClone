// FX
export type { CurrencyPair } from "./fx/currency-pair.js";
export { deriveBaseTerm, KNOWN_CURRENCY_PAIRS } from "./fx/currency-pair.js";

export type { PriceTick, Price } from "./fx/price.js";
export { PriceMovementType, calculateSpread, detectMovement, PRICE_HISTORY_SIZE } from "./fx/price.js";

export type { ExecutionRequest, Trade } from "./fx/trade.js";
export { Direction, TradeStatus, ExecutionStatus, deriveDealtCurrency, EXECUTION_TIMEOUT_MS, TOO_LONG_THRESHOLD_MS, CONFIRMATION_DISMISS_MS } from "./fx/trade.js";

export type { NotionalParseResult } from "./fx/notional.js";
export { parseNotional, isRfqRequired, validateNotional, DEFAULT_NOTIONAL, MAX_NOTIONAL, RFQ_THRESHOLD } from "./fx/notional.js";

export type { CurrencyCategory } from "./fx/currency-filter.js";
export { CURRENCY_CATEGORIES, matchesCurrencyFilter } from "./fx/currency-filter.js";

// Connection
export { ConnectionStatus, IDLE_TIMEOUT_MS, RECONNECT_INTERVAL_MS, nextConnectionStatus, mapGatewayStatus } from "./connection/connection-status.js";
export type { ConnectionEvent, GatewayStatus } from "./connection/connection-status.js";

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
export type { CreditTrade } from "./credit/credit-trade.js";

// Ports
export type { ReferenceDataPort } from "./ports/reference-data-port.js";
export type { PricingPort } from "./ports/pricing-port.js";
export type { ExecutionPort } from "./ports/execution-port.js";
export type { BlotterPort } from "./ports/blotter-port.js";
export type { AnalyticsPort } from "./ports/analytics-port.js";
export type { InstrumentPort } from "./ports/instrument-port.js";
export type { DealerPort } from "./ports/dealer-port.js";
export type { WorkflowPort, RfqEvent, CreateRfqRequest, QuoteRequest } from "./ports/workflow-port.js";

// Simulators (in-memory port implementations)
export {
  ReferenceDataSimulator,
  PricingSimulator,
  ExecutionSimulator,
  TradeStoreSimulator,
  AnalyticsSimulator,
  MockInstrumentService,
  MockDealerService,
  MockCreditRfqEngine,
  MOCK_INSTRUMENTS,
  MOCK_DEALERS,
} from "./simulators/index.js";
export type { RfqQuoteResult, TradeListener } from "./simulators/index.js";
