import {
  concat,
  defer,
  interval,
  map,
  type Observable,
  of,
  throwError,
} from "rxjs";

import type { Candle } from "../equities/candle.js";
import type { DepthBook, DepthLevel } from "../equities/depth.js";
import type { EquityInstrument } from "../equities/instrument.js";
import type { EquityQuote } from "../equities/quote.js";
import type { CandleTimeframe } from "../equities/timeframe.js";
import type { MarketDataPort } from "../ports/marketDataPort.js";
import { aggregateCandle, gbmStep } from "./gbm.js";
import { mulberry32 } from "./seededRandom.js";

const WATCHLIST: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ" },
  { symbol: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ" },
  { symbol: "JPM", name: "JPMorgan Chase", exchange: "NYSE" },
  { symbol: "XOM", name: "Exxon Mobil", exchange: "NYSE" },
];

const SEED_PRICES: Readonly<Record<string, number>> = {
  AAPL: 190,
  MSFT: 420,
  TSLA: 250,
  AMZN: 180,
  JPM: 200,
  XOM: 110,
};

const VOL = 0.0015;
const HALF_SPREAD_BPS = 0.0005;
const TICK_MS = 500;
const CANDLE_BUCKET_MS = 60_000;
const CANDLE_HISTORY = 60;
const DEPTH_LEVELS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
/** GBM samples folded into each bucket via aggregateCandle (I1 fix): one
 * sample per bucket makes open===high===low===close for every candle (a
 * degenerate doji) — the samples never diverge within a bucket because
 * there's only ever one. Splitting each bucket's motion into several
 * substeps gives every bar a real body + wicks. Substep vol is scaled by
 * 1/sqrt(n) so the compounded per-bucket variance still roughly matches the
 * original single-step vol (a random walk's variance is additive across
 * independent steps), keeping each timeframe's overall level/character
 * close to its previous (single-step) shape. */
const CANDLE_SUBSTEPS = 6;

interface TimeframeConfig {
  /** Number of candles in the returned series. */
  readonly count: number;
  /** Bucket duration in ms — spans roughly the named timeframe over `count`
   * buckets (e.g. "1M" ~ 30 days / 48 buckets = 15h/bucket). */
  readonly bucketMs: number;
  /** Per-step GBM volatility. */
  readonly vol: number;
  /** Distinct mulberry32 seed so each timeframe's chart differs. */
  readonly seed: number;
}

/** Per-timeframe candle generation config. "1D" is the original, unparameterised
 * shape (60 one-minute buckets, seed 7) — kept byte-identical so `candles(symbol)`
 * (no timeframe arg) stays a pure default-parameter alias for it. The others
 * follow the prototype's `TF_CONFIG` (bucket counts + step vol), with bucket
 * duration derived so `count` buckets roughly span the named period. */
const TF_CONFIG: Readonly<Record<CandleTimeframe, TimeframeConfig>> = {
  "1D": {
    count: CANDLE_HISTORY,
    bucketMs: CANDLE_BUCKET_MS,
    vol: VOL * 4,
    seed: 7,
  },
  "1W": {
    count: 44,
    bucketMs: Math.round((7 * DAY_MS) / 44),
    vol: 0.009,
    seed: 17,
  },
  "1M": {
    count: 48,
    bucketMs: Math.round((30 * DAY_MS) / 48),
    vol: 0.016,
    seed: 27,
  },
  "3M": {
    count: 52,
    bucketMs: Math.round((90 * DAY_MS) / 52),
    vol: 0.03,
    seed: 37,
  },
};

interface SymbolState {
  price: number;
  open: number;
  rng: () => number;
}

export class EquityMarketDataSimulator implements MarketDataPort {
  private readonly states = new Map<string, SymbolState>();

  constructor(seed = 1) {
    WATCHLIST.forEach((inst, i) => {
      this.states.set(inst.symbol, {
        price: SEED_PRICES[inst.symbol] ?? 100,
        open: SEED_PRICES[inst.symbol] ?? 100,
        rng: mulberry32(seed + i),
      });
    });
  }

  watchlist(): Observable<readonly EquityInstrument[]> {
    return of(WATCHLIST);
  }

  /** Latest simulated price for a symbol (synchronous; for fill-price marking). */
  currentPrice(symbol: string): number {
    return this.states.get(symbol)?.price ?? 100;
  }

  private getState(symbol: string): SymbolState | undefined {
    return this.states.get(symbol);
  }

  private toQuote(symbol: string, s: SymbolState, t: number): EquityQuote {
    const half = s.price * HALF_SPREAD_BPS;
    return {
      symbol,
      bid: s.price - half,
      ask: s.price + half,
      last: s.price,
      changePct: ((s.price - s.open) / s.open) * 100,
      timestamp: t,
    };
  }

  quotes(symbol: string): Observable<EquityQuote> {
    return defer(() => {
      const s = this.getState(symbol);
      if (!s)
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      const first = this.toQuote(symbol, s, Date.now());
      const live$ = interval(TICK_MS).pipe(
        map(() => {
          s.price = gbmStep(s.price, s.rng(), VOL);
          return this.toQuote(symbol, s, Date.now());
        }),
      );
      return concat(of(first), live$);
    });
  }

  candles(
    symbol: string,
    timeframe: CandleTimeframe = "1D",
  ): Observable<readonly Candle[]> {
    return defer(() => {
      const s = this.getState(symbol);
      if (!s)
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      const { count, bucketMs, vol, seed } = TF_CONFIG[timeframe];
      const rng = mulberry32(seed);
      const substepVol = vol / Math.sqrt(CANDLE_SUBSTEPS);
      let price = s.open;
      const out: Candle[] = [];
      const now = Date.now();

      for (let i = count - 1; i >= 0; i--) {
        const bucketTime =
          Math.floor((now - i * bucketMs) / bucketMs) * bucketMs;
        let candle: Candle | null = null;

        for (let sub = 0; sub < CANDLE_SUBSTEPS; sub++) {
          price = gbmStep(price, rng(), substepVol);
          candle = aggregateCandle(candle, price, bucketTime, bucketMs);
        }

        out.push(candle as Candle);
      }

      // Anchor the series to the CURRENT live price (I1 fix, second half):
      // the walk above starts from `s.open` (frozen at construction) on its
      // own seeded RNG stream, completely independent of the live quote's
      // ongoing per-tick walk (a different stream that keeps moving after
      // construction) — left alone the two diverge without bound, and
      // chartVm's live-overlay (which stretches the last candle's high/low
      // to include the live price) turns that gap into a permanent
      // full-height "wick" pillar. Rescaling every OHLC value by the ratio
      // needed to make the last bucket's close equal `s.price` keeps the
      // deterministic seeded SHAPE (same relative up/down pattern, same
      // tests' distinctness/determinism properties) while anchoring the
      // endpoint to wherever the live overlay will actually draw from — the
      // live overlay then only has to bridge the (much smaller) gap accrued
      // since THIS series was generated, not since the simulator itself was
      // constructed.
      const rawEndClose = out.at(-1)?.close;
      const scale = rawEndClose ? s.price / rawEndClose : 1;

      const anchored: Candle[] = out.map((c) => {
        return {
          time: c.time,
          open: c.open * scale,
          high: c.high * scale,
          low: c.low * scale,
          close: c.close * scale,
        };
      });

      return of(anchored as readonly Candle[]);
    });
  }

  depth(symbol: string): Observable<DepthBook> {
    return defer(() => {
      const s = this.getState(symbol);
      if (!s)
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      const rng = mulberry32(13);
      const bids: DepthLevel[] = [];
      const asks: DepthLevel[] = [];
      const tick = s.price * HALF_SPREAD_BPS;

      for (let i = 0; i < DEPTH_LEVELS; i++) {
        bids.push({
          price: s.price - tick * (i + 1),
          size: Math.round(100 + rng() * 900),
        });
        asks.push({
          price: s.price + tick * (i + 1),
          size: Math.round(100 + rng() * 900),
        });
      }

      return of({ symbol, bids, asks });
    });
  }
}
