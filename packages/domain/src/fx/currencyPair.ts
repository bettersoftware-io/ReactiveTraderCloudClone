export interface CurrencyPair {
  readonly symbol: string;
  readonly ratePrecision: number;
  readonly pipsPosition: number;
  readonly base: string;
  readonly terms: string;
  readonly defaultNotional: number;
  /** PROTO baseRates (dc.html L804); EURCAD/EURAUD cross-derived (spec §3.1). */
  readonly baseMid: number;
  /** PROTO meta.spread in pips (dc.html L750-755). */
  readonly typicalSpreadPips: number;
}

export interface BaseTerm {
  base: string;
  terms: string;
}

export function deriveBaseTerm(symbol: string): BaseTerm {
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
    baseMid: 1.09213,
    typicalSpreadPips: 1.4,
  },
  {
    symbol: "USDJPY",
    ratePrecision: 3,
    pipsPosition: 2,
    base: "USD",
    terms: "JPY",
    defaultNotional: 1_000_000,
    baseMid: 151.203,
    typicalSpreadPips: 1.6,
  },
  {
    symbol: "GBPUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "GBP",
    terms: "USD",
    defaultNotional: 1_000_000,
    baseMid: 1.26414,
    typicalSpreadPips: 1.8,
  },
  {
    symbol: "GBPJPY",
    ratePrecision: 3,
    pipsPosition: 2,
    base: "GBP",
    terms: "JPY",
    defaultNotional: 1_000_000,
    baseMid: 191.085,
    typicalSpreadPips: 2.6,
  },
  {
    symbol: "EURJPY",
    ratePrecision: 3,
    pipsPosition: 2,
    base: "EUR",
    terms: "JPY",
    defaultNotional: 1_000_000,
    baseMid: 165.142,
    typicalSpreadPips: 2.1,
  },
  {
    symbol: "AUDUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "AUD",
    terms: "USD",
    defaultNotional: 1_000_000,
    baseMid: 0.66121,
    typicalSpreadPips: 2.0,
  },
  {
    symbol: "NZDUSD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "NZD",
    terms: "USD",
    defaultNotional: 10_000_000,
    baseMid: 0.61054,
    typicalSpreadPips: 2.4,
  },
  {
    symbol: "EURCAD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "EUR",
    terms: "CAD",
    defaultNotional: 1_000_000,
    baseMid: 1.49385,
    typicalSpreadPips: 2.2,
  },
  {
    symbol: "EURAUD",
    ratePrecision: 5,
    pipsPosition: 4,
    base: "EUR",
    terms: "AUD",
    defaultNotional: 1_000_000,
    baseMid: 1.65172,
    typicalSpreadPips: 2.0,
  },
] as const;
