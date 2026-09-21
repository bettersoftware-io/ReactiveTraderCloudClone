import {
  type Candle,
  type CurrencyPair,
  type Dealer,
  type DepthBook,
  Direction,
  type EquityInstrument,
  type EquityOrder,
  type EquityPosition,
  type EquityQuote,
  type Instrument,
  KNOWN_CURRENCY_PAIRS,
  type PositionUpdates,
  type Price,
  PriceMovementType,
  type PriceTick,
  type Quote,
  type Rfq,
  type RfqQuoteResult,
  RfqState,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

/** The pair every suite defaults to, and a second one for identity cases. */
export const EURUSD: CurrencyPair = findPair("EURUSD");
export const GBPUSD: CurrencyPair = findPair("GBPUSD");

/** A raw port tick around `mid` with a 1-pip spread. `at` defaults to 0 so
 * two ticks built in one test are distinguishable only by `mid` — pass a
 * timestamp when order matters. */
export function createTick(symbol: string, mid: number, at = 0): PriceTick {
  return {
    symbol,
    bid: mid - 0.00005,
    ask: mid + 0.00005,
    mid,
    valueDate: "2026-01-03",
    creationTimestamp: at,
  };
}

/** An enriched price, for machine intents that take one (`tileExecution`). */
export function createPrice(symbol: string, mid: number): Price {
  return {
    ...createTick(symbol, mid),
    movementType: PriceMovementType.NONE,
    spread: "1.0",
  };
}

export function createTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    tradeId: 1,
    tradeName: "A.Stark",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.1,
    status: TradeStatus.Done,
    tradeDate: "2026-01-01",
    valueDate: "2026-01-03",
    ...overrides,
  };
}

export function createPositionUpdates(usdPnl: number): PositionUpdates {
  return {
    currentPositions: [],
    history: [{ timestamp: "2026-01-01T00:00:00.000Z", usdPnl }],
  };
}

/** An open credit RFQ created "now" (`creationTimestamp` 0 — pass one when
 * the countdown matters). */
export function createRfq(overrides: Partial<Rfq> = {}): Rfq {
  return {
    id: 1,
    instrumentId: 1,
    quantity: 1_000_000,
    direction: Direction.Buy,
    state: RfqState.Open,
    expirySecs: 120,
    creationTimestamp: 0,
    ...overrides,
  };
}

export function createQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 1,
    rfqId: 1,
    dealerId: 1,
    state: { type: "pendingWithoutPrice" },
    ...overrides,
  };
}

export function createDealer(id: number, name = `Dealer ${id}`): Dealer {
  return { id, name };
}

export function createInstrument(
  overrides: Partial<Instrument> = {},
): Instrument {
  return {
    id: 1,
    name: "Acme 5% 2030",
    cusip: "000000AA0",
    ticker: "ACME",
    maturity: "2030-01-01",
    interestRate: 5,
    benchmark: "UST 10Y",
    refPrice: 100,
    ...overrides,
  };
}

/** An FX RFQ quote around `mid` with a 1-pip spread. */
export function createRfqQuoteResult(mid: number): RfqQuoteResult {
  return { bid: mid - 0.00005, ask: mid + 0.00005, mid };
}

function findPair(symbol: string): CurrencyPair {
  const pair = KNOWN_CURRENCY_PAIRS.find((candidate) => {
    return candidate.symbol === symbol;
  });

  if (pair === undefined) {
    throw new Error(`fixtures: ${symbol} is not a known currency pair`);
  }

  return pair;
}

export const AAPL: EquityInstrument = {
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
};
export const MSFT: EquityInstrument = {
  symbol: "MSFT",
  name: "Microsoft Corp.",
  exchange: "NASDAQ",
};
export const TSLA: EquityInstrument = {
  symbol: "TSLA",
  name: "Tesla Inc.",
  exchange: "NASDAQ",
};

/** An equity quote around `last` with a 2-cent spread. */
export function createEquityQuote(
  symbol: string,
  last: number,
  at = 0,
): EquityQuote {
  return {
    symbol,
    bid: last - 0.01,
    ask: last + 0.01,
    last,
    changePct: 0,
    timestamp: at,
  };
}

export function createCandle(time: number, close = 100): Candle {
  return {
    time,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000,
  };
}

/** `count` candles ascending from `fromTime`, one per `stepMs`. */
export function createCandles(
  count: number,
  fromTime: number,
  stepMs = 60_000,
): readonly Candle[] {
  return Array.from({ length: count }, (_unused, index) => {
    return createCandle(fromTime + index * stepMs);
  });
}

export function createDepthBook(symbol: string, mid = 100): DepthBook {
  return {
    symbol,
    bids: [{ price: mid - 0.01, size: 100 }],
    asks: [{ price: mid + 0.01, size: 100 }],
  };
}

export function createEquityOrder(
  overrides: Partial<EquityOrder> = {},
): EquityOrder {
  return {
    id: "ord-1",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    qty: 100,
    status: "working",
    filledQty: 0,
    createdAt: 0,
    ...overrides,
  };
}

export function createEquityPosition(
  symbol: string,
  qty = 100,
): EquityPosition {
  return { symbol, qty, avgPrice: 100, markPrice: 101, unrealisedPnl: qty };
}
