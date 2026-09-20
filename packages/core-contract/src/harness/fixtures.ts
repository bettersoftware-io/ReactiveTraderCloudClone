import {
  type CurrencyPair,
  type Dealer,
  Direction,
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
