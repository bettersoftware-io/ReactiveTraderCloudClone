import {
  ConnectionStatus,
  PriceMovementType,
  Direction, RfqState, TradeStatus, ADAPTIVE_BANK_NAME,
  type CurrencyPair, type Price, type PositionUpdates,
  type Trade, type Instrument, type Dealer, type Rfq, type Quote,
} from "@rtc/domain";
import { type AppData, makeAppData } from "./appData";

const eurusd: CurrencyPair = {
  symbol: "EURUSD", ratePrecision: 5, pipsPosition: 4,
  base: "EUR", terms: "USD", defaultNotional: 1_000_000,
};

const eurusdPrice: Price = {
  symbol: "EURUSD",
  bid: 1.09213, ask: 1.09227, mid: 1.0922,
  valueDate: "2026-06-08", creationTimestamp: 1_750_000_000_000,
  movementType: PriceMovementType.UP,
  spread: "1.4",
};

const analyticsData: PositionUpdates = {
  currentPositions: [
    { symbol: "EURUSD", basePnl: 12500, baseTradedAmount: 3_000_000, counterTradedAmount: -3_276_600 },
    { symbol: "USDJPY", basePnl: -4200, baseTradedAmount: -1_000_000, counterTradedAmount: 151_200_000 },
    { symbol: "GBPUSD", basePnl: 8800, baseTradedAmount: 2_000_000, counterTradedAmount: -2_534_000 },
  ],
  history: [
    { timestamp: "2026-06-06T09:00:00Z", usdPnl: 0 },
    { timestamp: "2026-06-06T10:00:00Z", usdPnl: 5400 },
    { timestamp: "2026-06-06T11:00:00Z", usdPnl: 3100 },
    { timestamp: "2026-06-06T12:00:00Z", usdPnl: 9200 },
    { timestamp: "2026-06-06T13:00:00Z", usdPnl: 17100 },
  ],
};

const gbpusd: CurrencyPair = {
  symbol: "GBPUSD", ratePrecision: 5, pipsPosition: 4,
  base: "GBP", terms: "USD", defaultNotional: 1_000_000,
};
const usdjpy: CurrencyPair = {
  symbol: "USDJPY", ratePrecision: 3, pipsPosition: 2,
  base: "USD", terms: "JPY", defaultNotional: 1_000_000,
};
const gbpusdPrice: Price = {
  symbol: "GBPUSD", bid: 1.26410, ask: 1.26428, mid: 1.26419,
  valueDate: "2026-06-08", creationTimestamp: 1_750_000_000_000,
  movementType: PriceMovementType.DOWN, spread: "1.8",
};
const usdjpyPrice: Price = {
  symbol: "USDJPY", bid: 151.203, ask: 151.219, mid: 151.211,
  valueDate: "2026-06-08", creationTimestamp: 1_750_000_000_000,
  movementType: PriceMovementType.UP, spread: "1.6",
};

// FX blotter trades — static, deterministic rows for BlotterRow + filters.
const fxTrades: readonly Trade[] = [
  { tradeId: 4001, tradeName: "Trade 4001", currencyPair: "EURUSD", notional: 1_000_000, dealtCurrency: "EUR", direction: Direction.Buy, spotRate: 1.09221, status: TradeStatus.Done, tradeDate: "2026-06-06", valueDate: "2026-06-08" },
  { tradeId: 4002, tradeName: "Trade 4002", currencyPair: "USDJPY", notional: 5_000_000, dealtCurrency: "USD", direction: Direction.Sell, spotRate: 151.211, status: TradeStatus.Done, tradeDate: "2026-06-05", valueDate: "2026-06-07" },
  { tradeId: 4003, tradeName: "Trade 4003", currencyPair: "GBPUSD", notional: 2_500_000, dealtCurrency: "GBP", direction: Direction.Buy, spotRate: 1.26419, status: TradeStatus.Rejected, tradeDate: "2026-06-05", valueDate: "2026-06-07" },
];

// Credit fixture — instrument/dealer/rfq/quote ids are cross-linked:
//   RfqTilesPanel (default "Live" filter) needs an Open rfq + its quotes;
//   CreditBlotter needs a Closed rfq with an accepted quote in allQuotes;
//   SellSidePanel needs a quote from the "Adaptive Bank" dealer.
const creditInstruments: readonly Instrument[] = [
  { id: 1, name: "US Treasury 10Y", cusip: "912828ZQ6", ticker: "T 1.5 02/34", maturity: "2034-02-15", interestRate: 1.5, benchmark: "10Y" },
  { id: 2, name: "Apple Inc 2030", cusip: "037833EK8", ticker: "AAPL 2.4 30", maturity: "2030-05-11", interestRate: 2.4, benchmark: "7Y" },
];
const creditDealers: readonly Dealer[] = [
  { id: 1, name: ADAPTIVE_BANK_NAME },
  { id: 2, name: "Citi" },
  { id: 3, name: "JP Morgan" },
  { id: 4, name: "Goldman Sachs" },
];
const creditRfqs: readonly Rfq[] = [
  { id: 101, instrumentId: 1, quantity: 5_000_000, direction: Direction.Buy, state: RfqState.Open, expirySecs: 120, creationTimestamp: 1_750_000_300_000 },
  { id: 102, instrumentId: 2, quantity: 2_000_000, direction: Direction.Sell, state: RfqState.Closed, expirySecs: 120, creationTimestamp: 1_750_000_200_000 },
];
const creditQuotes101: readonly Quote[] = [
  { id: 1001, rfqId: 101, dealerId: 1, state: { type: "pendingWithPrice", price: 98.45 } },
  { id: 1002, rfqId: 101, dealerId: 2, state: { type: "pendingWithPrice", price: 98.5 } },
  { id: 1003, rfqId: 101, dealerId: 3, state: { type: "pendingWithoutPrice" } },
];
const creditQuotes102: readonly Quote[] = [
  { id: 2001, rfqId: 102, dealerId: 2, state: { type: "accepted", price: 101.2 } },
];
const creditAllQuotes: ReadonlyMap<number, Quote> = new Map(
  [...creditQuotes101, ...creditQuotes102].map((q) => [q.id, q]),
);

export const fixtures: Record<string, AppData> = {
  "connection-connected": makeAppData({
    connectionStatus: ConnectionStatus.CONNECTED,
  }),
  "connection-disconnected": makeAppData({
    connectionStatus: ConnectionStatus.DISCONNECTED,
  }),
  "tile-eurusd-up": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: eurusdPrice },
  }),
  "tile-loading": makeAppData({
    currencyPairs: [eurusd],
    prices: { EURUSD: null },
  }),
  "analytics-populated": makeAppData({ analytics: analyticsData }),
  "analytics-loading": makeAppData({ analytics: null }),
  "connection-offline": makeAppData({
    connectionStatus: ConnectionStatus.OFFLINE_DISCONNECTED,
  }),
  "live-rates-populated": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
  }),
  "app-fx": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    analytics: analyticsData,
    connectionStatus: ConnectionStatus.CONNECTED,
  }),
  "fx-trades": makeAppData({
    currencyPairs: [eurusd, gbpusd, usdjpy],
    prices: { EURUSD: eurusdPrice, GBPUSD: gbpusdPrice, USDJPY: usdjpyPrice },
    trades: fxTrades,
  }),
  "credit-populated": makeAppData({
    instruments: creditInstruments,
    dealers: creditDealers,
    rfqs: creditRfqs,
    quotesForRfq: { 101: creditQuotes101, 102: creditQuotes102 },
    allQuotes: creditAllQuotes,
  }),
};
