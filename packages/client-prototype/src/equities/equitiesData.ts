import type { Candle, EqMeta, EqSym, Timeframe } from "#/equities/types";

export const EQ_SEQ_START = 5001;
export const ORDER_CAP = 40;

// PROTO L764-768: the 8 seeded equities (price is the seed last).
export const EQ_META: Record<EqSym, EqMeta> = {
  AAPL: { name: "Apple Inc", exch: "NASDAQ", px: 229.35 },
  MSFT: { name: "Microsoft Corp", exch: "NASDAQ", px: 467.12 },
  NVDA: { name: "NVIDIA Corp", exch: "NASDAQ", px: 131.26 },
  TSLA: { name: "Tesla Inc", exch: "NASDAQ", px: 251.44 },
  AMZN: { name: "Amazon.com", exch: "NASDAQ", px: 218.07 },
  GOOGL: { name: "Alphabet Inc", exch: "NASDAQ", px: 178.53 },
  META: { name: "Meta Platforms", exch: "NASDAQ", px: 591.8 },
  SPY: { name: "S&P 500 ETF", exch: "NYSE ARCA", px: 588.21 },
};

export const EQ_SYMS: EqSym[] = Object.keys(EQ_META) as EqSym[];

interface TfConfig {
  bars: number;
  vol: number;
}

// PROTO L839 genCandles cfg: [bars, volatility] per timeframe.
const TF_CONFIG: Record<Timeframe, TfConfig> = {
  "1D": { bars: 40, vol: 0.004 },
  "1W": { bars: 44, vol: 0.009 },
  "1M": { bars: 48, vol: 0.016 },
  "3M": { bars: 52, vol: 0.03 },
};

// Local formatter (Equities stays self-contained — no import from fx/ or credit/).
export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// PROTO L839: a synthetic OHLC series. Starts vol*6 below the seed price and
// random-walks `bars` candles. Pure — the RNG is injected so smokes are
// deterministic and the series is generated outside any setState updater.
export function genCandles(
  sym: EqSym,
  tf: Timeframe,
  rng: () => number,
): Candle[] {
  const { bars, vol } = TF_CONFIG[tf];
  const out: Candle[] = [];
  let px = EQ_META[sym].px * (1 - vol * 6);

  for (let i = 0; i < bars; i += 1) {
    const o = px;
    const c = o * (1 + (rng() - 0.48) * vol * 2);
    const h = Math.max(o, c) * (1 + rng() * vol);
    const l = Math.min(o, c) * (1 - rng() * vol);
    out.push({ o, h, l, c });
    px = c;
  }

  return out;
}

// PROTO L1338 inst.vol: `(2.4 + rng()*0.2)M`. The prototype recomputes this with
// Math.random() on every render (visible jitter); here it is drawn once per
// symbol from the seeded RNG and held stable (spec §3 deliberate deviation).
export function seedVols(rng: () => number): Record<EqSym, string> {
  const vols = {} as Record<EqSym, string>;

  for (const sym of EQ_SYMS) {
    vols[sym] = `${(2.4 + rng() * 0.2).toFixed(1)}M`;
  }

  return vols;
}
