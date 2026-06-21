export interface CurrencyPair {
  readonly symbol: string;
  readonly ratePrecision: number;
  readonly pipsPosition: number;
  readonly base: string;
  readonly terms: string;
  readonly defaultNotional: number;
}

export function deriveBaseTerm(symbol: string): {
  base: string;
  terms: string;
} {
  return {
    base: symbol.slice(0, 3),
    terms: symbol.slice(3, 6),
  };
}

export const KNOWN_CURRENCY_PAIRS: readonly CurrencyPair[] = [
  {
    symbol: "EURUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "EUR",
    terms: "USD",
    defaultNotional: 1_000_000,
  },
  {
    symbol: "USDJPY",
    ratePrecision: 3,
    pipsPosition: 2,
    base: "USD",
    terms: "JPY",
    defaultNotional: 1_000_000,
  },
  {
    symbol: "GBPUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "GBP",
    terms: "USD",
    defaultNotional: 1_000_000,
  },
  {
    symbol: "GBPJPY",
    ratePrecision: 3,
    pipsPosition: 2,
    base: "GBP",
    terms: "JPY",
    defaultNotional: 1_000_000,
  },
  {
    symbol: "EURJPY",
    ratePrecision: 3,
    pipsPosition: 2,
    base: "EUR",
    terms: "JPY",
    defaultNotional: 1_000_000,
  },
  {
    symbol: "AUDUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "AUD",
    terms: "USD",
    defaultNotional: 1_000_000,
  },
  {
    symbol: "NZDUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "NZD",
    terms: "USD",
    defaultNotional: 10_000_000,
  },
  {
    symbol: "EURCAD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "EUR",
    terms: "CAD",
    defaultNotional: 1_000_000,
  },
  {
    symbol: "EURAUD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "EUR",
    terms: "AUD",
    defaultNotional: 1_000_000,
  },
] as const;
