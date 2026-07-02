/**
 * WebSocket wire message-type constants — single source of truth.
 *
 * Client → Server: subscription requests + RPC calls
 * Server → Client: streaming data + RPC responses
 *
 * These strings must match verbatim what the client sends and the server
 * expects; a typo here breaks the wire contract silently.
 */

// ── Client → Server ─────────────────────────────────────────────

export const CLIENT_MSG = {
  // FX subscriptions
  SUBSCRIBE_REFERENCE_DATA: "subscribe.referenceData",
  SUBSCRIBE_PRICING: "subscribe.pricing",
  SUBSCRIBE_BLOTTER: "subscribe.blotter",
  SUBSCRIBE_ANALYTICS: "subscribe.analytics",
  // Credit subscriptions
  SUBSCRIBE_INSTRUMENTS: "subscribe.instruments",
  SUBSCRIBE_DEALERS: "subscribe.dealers",
  SUBSCRIBE_WORKFLOW: "subscribe.workflow",
  // FX RPCs
  EXECUTE_TRADE: "rpc.executeTrade",
  GET_PRICE_HISTORY: "rpc.getPriceHistory",
  // Credit RPCs
  CREATE_RFQ: "rpc.createRfq",
  CANCEL_RFQ: "rpc.cancelRfq",
  QUOTE: "rpc.quote",
  PASS: "rpc.pass",
  ACCEPT: "rpc.accept",
  // Admin
  GET_THROUGHPUT: "admin.getThroughput",
  SET_THROUGHPUT: "admin.setThroughput",
  // Equities
  SUBSCRIBE_WATCHLIST: "subscribe.watchlist",
  SUBSCRIBE_EQ_QUOTES: "subscribe.eqQuotes",
  GET_CANDLES: "rpc.getCandles",
  SUBSCRIBE_DEPTH: "subscribe.depth",
  PLACE_ORDER: "rpc.placeOrder",
  CANCEL_ORDER: "rpc.cancelOrder",
  SUBSCRIBE_ORDERS: "subscribe.orders",
  SUBSCRIBE_POSITIONS: "subscribe.positions",
} as const;

// ── Server → Client ─────────────────────────────────────────────

export const SERVER_MSG = {
  // FX streams
  REFERENCE_DATA: "stream.referenceData",
  PRICE_TICK: "stream.priceTick",
  BLOTTER: "stream.blotter",
  ANALYTICS: "stream.analytics",
  // Credit streams
  INSTRUMENT_EVENT: "stream.instrumentEvent",
  DEALER_EVENT: "stream.dealerEvent",
  WORKFLOW_EVENT: "stream.workflowEvent",
  // RPC responses
  EXECUTION_RESPONSE: "rpc.executeTrade.response",
  PRICE_HISTORY_RESPONSE: "rpc.getPriceHistory.response",
  CREATE_RFQ_RESPONSE: "rpc.createRfq.response",
  CANCEL_RFQ_RESPONSE: "rpc.cancelRfq.response",
  QUOTE_RESPONSE: "rpc.quote.response",
  PASS_RESPONSE: "rpc.pass.response",
  ACCEPT_RESPONSE: "rpc.accept.response",
  // Admin
  THROUGHPUT_RESPONSE: "admin.getThroughput.response",
  SET_THROUGHPUT_RESPONSE: "admin.setThroughput.response",
  // Equities
  WATCHLIST: "stream.watchlist",
  EQ_QUOTE: "stream.eqQuote",
  CANDLES_RESPONSE: "rpc.getCandles.response",
  DEPTH: "stream.depth",
  PLACE_ORDER_RESPONSE: "rpc.placeOrder.response",
  ORDER_LIFECYCLE: "stream.orderLifecycle",
  CANCEL_ORDER_RESPONSE: "rpc.cancelOrder.response",
  ORDERS: "stream.orders",
  POSITIONS: "stream.positions",
} as const;
