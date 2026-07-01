import type { PairMeta, SplitPrice, Sym, Trade } from "#/fx/types";

export const ORDER: readonly Sym[] = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "EURJPY",
  "GBPJPY",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
];

export const META: Record<Sym, PairMeta> = {
  EURUSD: { pair: "EUR / USD", base: "EUR", d: 5, bigLen: 4, spread: "1.4" },
  GBPUSD: { pair: "GBP / USD", base: "GBP", d: 5, bigLen: 4, spread: "1.8" },
  USDJPY: { pair: "USD / JPY", base: "USD", d: 3, bigLen: 3, spread: "1.6" },
  EURJPY: { pair: "EUR / JPY", base: "EUR", d: 3, bigLen: 3, spread: "2.1" },
  GBPJPY: { pair: "GBP / JPY", base: "GBP", d: 3, bigLen: 3, spread: "2.6" },
  AUDUSD: { pair: "AUD / USD", base: "AUD", d: 5, bigLen: 4, spread: "2.0" },
  USDCAD: { pair: "USD / CAD", base: "USD", d: 5, bigLen: 4, spread: "2.2" },
  NZDUSD: { pair: "NZD / USD", base: "NZD", d: 5, bigLen: 4, spread: "2.4" },
};

export const BASE_RATES: Record<Sym, number> = {
  EURUSD: 1.09213,
  GBPUSD: 1.26414,
  USDJPY: 151.203,
  EURJPY: 165.142,
  GBPJPY: 191.085,
  AUDUSD: 0.66121,
  USDCAD: 1.36782,
  NZDUSD: 0.61054,
};

export const RFQ_THRESHOLD = 10_000_000;
export const FX_SEQ_START = 1043;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function parseNotional(str: string | null): number {
  if (str == null) {
    return NaN;
  }

  let s = String(str).trim().toLowerCase().replace(/,/g, "");
  let m = 1;

  if (s.endsWith("m")) {
    m = 1e6;
    s = s.slice(0, -1);
  } else if (s.endsWith("k")) {
    m = 1e3;
    s = s.slice(0, -1);
  }

  const n = parseFloat(s);
  return Number.isNaN(n) ? NaN : Math.round(n * m);
}

export function splitPrice(rate: number, meta: PairMeta): SplitPrice {
  const s = rate.toFixed(meta.d);
  return {
    big: s.slice(0, meta.bigLen),
    pips: s.slice(meta.bigLen, meta.bigLen + 2),
    frac: s.slice(meta.bigLen + 2),
  };
}

export function fmtDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

export function fmtShort(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

function seedTrade(
  id: number,
  status: Trade["status"],
  dir: Trade["dir"],
  symbol: Sym,
  dealtCcy: string,
  notionalNum: number,
  rate: string,
  trader: string,
  off: number,
): Trade {
  return {
    id,
    status,
    dir,
    symbol,
    dealtCcy,
    notional: fmtNum(notionalNum),
    notionalNum,
    rate,
    trader,
    tradeDate: fmtDate(off),
    valueDate: fmtDate(off + 2),
  };
}

export const SEED_TRADES: Trade[] = [
  seedTrade(
    1042,
    "Done",
    "Buy",
    "EURUSD",
    "EUR",
    1_000_000,
    "1.09213",
    "A.Stark",
    -3,
  ),
  seedTrade(
    1041,
    "Done",
    "Sell",
    "USDJPY",
    "USD",
    2_000_000,
    "151.203",
    "A.Stark",
    -3,
  ),
  seedTrade(
    1040,
    "Rejected",
    "Buy",
    "GBPUSD",
    "GBP",
    500_000,
    "1.26414",
    "N.Romanoff",
    -4,
  ),
  seedTrade(
    1039,
    "Done",
    "Sell",
    "EURJPY",
    "EUR",
    1_500_000,
    "165.142",
    "S.Rogers",
    -5,
  ),
  seedTrade(
    1038,
    "Done",
    "Buy",
    "AUDUSD",
    "AUD",
    3_000_000,
    "0.66121",
    "B.Banner",
    -6,
  ),
];
