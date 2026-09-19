import {
  type CurrencyPair,
  Direction,
  KNOWN_CURRENCY_PAIRS,
  type PositionUpdates,
  type Price,
  PriceMovementType,
  type PriceTick,
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

function findPair(symbol: string): CurrencyPair {
  const pair = KNOWN_CURRENCY_PAIRS.find((candidate) => {
    return candidate.symbol === symbol;
  });

  if (pair === undefined) {
    throw new Error(`fixtures: ${symbol} is not a known currency pair`);
  }

  return pair;
}
