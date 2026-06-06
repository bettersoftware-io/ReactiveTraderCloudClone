import {
  ConnectionStatus,
  PriceMovementType,
  type CurrencyPair, type Price, type PositionUpdates,
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
};
