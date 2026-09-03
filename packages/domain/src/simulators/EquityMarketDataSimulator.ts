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
import {
  CANDLE_HISTORY_DEPTH_MAX,
  CANDLE_HISTORY_TOTAL,
  type CandleTimeframe,
} from "../equities/timeframe.js";
import type { MarketDataPort } from "../ports/marketDataPort.js";
import { aggregateCandle, gbmStep } from "./gbm.js";
import { hashString, mulberry32 } from "./seededRandom.js";

/** The mobile-v1 design's eight-stock roster, names and seed prices verbatim
 * (`_seedStocks` in `docs/design/mobile/v1/standalone/`) — the web-v5 design
 * carries the same eight minus NFLX plus SPY; where the two disagree the
 * measured surface (the RN prototype-fidelity comparison) wins. AAPL must
 * stay first: the composition root selects whatever heads this catalogue. */
const WATCHLIST: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" },
  { symbol: "NVDA", name: "NVIDIA Corp", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ" },
  { symbol: "AMZN", name: "Amazon.com", exchange: "NASDAQ" },
  { symbol: "META", name: "Meta Platforms", exchange: "NASDAQ" },
  { symbol: "GOOGL", name: "Alphabet A", exchange: "NASDAQ" },
  { symbol: "NFLX", name: "Netflix Inc", exchange: "NASDAQ" },
];

const SEED_PRICES: Readonly<Record<string, number>> = {
  AAPL: 227.4,
  NVDA: 131.2,
  TSLA: 248.9,
  MSFT: 441.1,
  AMZN: 186.3,
  META: 511.8,
  GOOGL: 172.6,
  NFLX: 645.2,
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
/** Distinct rng-stream offset for per-candle volume, kept far from the
 * per-timeframe price seeds above (7/17/27/37) so the two streams never
 * collide. Volume is drawn from its own mulberry32 stream AFTER the price
 * walk completes — never interleaved with price draws — so it can't perturb
 * the OHLC sequence the A1 pin test snapshots. */
const VOLUME_SEED_OFFSET = 9973;
/** Baseline shares per bucket; scaled by a random factor and by the bucket's
 * relative high-low range so more volatile bars trade more volume. */
const BASE_VOLUME = 1_000_000;
/** Distinct rng-stream offset for the prepended back-walk (Task A3): far
 * enough from VOLUME_SEED_OFFSET (9973) that `BACK_SEED_OFFSET +
 * VOLUME_SEED_OFFSET` (the back walk's own volume stream) never collides
 * with any forward-walk stream. Kept on its own seeded rng entirely — the
 * back walk must never share a stream with the forward walk, or the A1 pin
 * (newest-60 byte-identical snapshot) would go red. */
const BACK_SEED_OFFSET = 4241;
/** Distinct rng-stream offset for the DEEP backfill walk (beyond the
 * Phase-A prepend). Far from every other offset so no stream collides —
 * the A1 pin (newest-60 byte-identical) and the Phase-A back block both
 * stay untouched. */
const DEEP_SEED_OFFSET = 15013;

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

/** Per `symbol|timeframe`: the {unscaled oldest close, live-anchor scale} of
 * the most recent candles() emission — what the deep cache must chain to. */
interface BaseAnchor {
  readonly backStartUnscaled: number;
  readonly liveScale: number;
  readonly oldestTime: number;
  readonly bucketMs: number;
}

export class EquityMarketDataSimulator implements MarketDataPort {
  private readonly states = new Map<string, SymbolState>();

  /** Deep-history cache per `symbol|timeframe`: built ONCE on first
   * candleHistory request by snapshotting `now` and walking
   * CANDLE_HISTORY_DEPTH_MAX − CANDLE_HISTORY_TOTAL buckets further back
   * from where candles()' own back walk stops, on yet another independent
   * rng stream (DEEP_SEED_OFFSET — the Phase-A pin must never move).
   * Pages are slices of this cache, which is what makes the determinism
   * and page-continuity laws hold structurally. The cache chains to the
   * base series via the same seam-rescale trick as the Phase-A back walk,
   * multiplied by the live-anchor factor the last candles() call used
   * (stored per key below); if candles() re-runs later with a new anchor
   * the seam drifts by the sub-percent price move since — the same
   * accepted gap class as the live overlay itself. */
  private readonly deepHistory = new Map<string, readonly Candle[]>();

  /** Per `symbol|timeframe`: the {unscaled oldest close, live-anchor scale}
   * of the most recent candles() emission — what the deep cache must chain
   * to. */
  private readonly baseAnchors = new Map<string, BaseAnchor>();

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

      if (!s) {
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      }

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

      if (!s) {
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      }

      const { count, bucketMs, vol, seed } = TF_CONFIG[timeframe];
      // Seed from timeframe AND symbol. Seeding from the timeframe alone
      // gave every symbol the identical sequence of percentage moves — and
      // because gbmStep is purely multiplicative, the only per-symbol input
      // (the `s.open` starting level) factors straight out, making the
      // series exact scalar multiples of each other. chartVm autoscales
      // each series to its own min/max, where a constant factor cancels, so
      // every symbol rendered a PIXEL-identical chart (only the price-axis
      // labels differed). Mixing a stable hash of the symbol into the seed
      // gives each instrument its own shape while keeping determinism.
      const rng = mulberry32(seed + hashString(symbol));
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

      // Volume: a separate rng stream, seeded independently of the price
      // walk above and drawn only after that walk finishes — see the
      // VOLUME_SEED_OFFSET comment. Volume is share count, not price, so it
      // must survive the anchoring rescale below unchanged.
      const volRng = mulberry32(seed + hashString(symbol) + VOLUME_SEED_OFFSET);
      const withVolume: Candle[] = out.map((c) => {
        const range = c.close > 0 ? (c.high - c.low) / c.close : 0;
        return {
          ...c,
          volume: Math.round(BASE_VOLUME * (0.4 + volRng()) * (1 + 40 * range)),
        };
      });

      // Deepen the history (Task A3): prepend CANDLE_HISTORY_TOTAL - count
      // older candles from a SEPARATE seeded rng stream (BACK_SEED_OFFSET),
      // walking the same substep shape into the past. This must never share
      // an rng stream with the forward walk above — the A1 pin snapshots
      // the newest 60 candles byte-for-byte, and any shared stream would
      // perturb it.
      const rngBack = mulberry32(seed + hashString(symbol) + BACK_SEED_OFFSET);
      const volRngBack = mulberry32(
        seed + hashString(symbol) + BACK_SEED_OFFSET + VOLUME_SEED_OFFSET,
      );
      let backPrice = s.open;
      const back: Candle[] = [];

      // i counts buckets back from "now": the forward walk owns [count-1 .. 0],
      // the back walk owns [CANDLE_HISTORY_TOTAL-1 .. count] (older).
      for (let i = CANDLE_HISTORY_TOTAL - 1; i >= count; i--) {
        const bucketTime =
          Math.floor((now - i * bucketMs) / bucketMs) * bucketMs;
        let candle: Candle | null = null;

        for (let sub = 0; sub < CANDLE_SUBSTEPS; sub++) {
          backPrice = gbmStep(backPrice, rngBack(), substepVol);
          candle = aggregateCandle(candle, backPrice, bucketTime, bucketMs);
        }

        const built = candle as Candle;
        const range =
          built.close > 0 ? (built.high - built.low) / built.close : 0;
        back.push({
          ...built,
          volume: Math.round(
            BASE_VOLUME * (0.4 + volRngBack()) * (1 + 40 * range),
          ),
        });
      }

      // Seam continuity: rescale the back block so its final close === s.open,
      // the price the forward walk stepped away from.
      const backEndClose = back.at(-1)?.close;
      const backScale = backEndClose ? s.open / backEndClose : 1;
      const backAnchored: Candle[] = back.map((c) => {
        return {
          time: c.time,
          open: c.open * backScale,
          high: c.high * backScale,
          low: c.low * backScale,
          close: c.close * backScale,
          volume: c.volume,
        };
      });

      const full = [...backAnchored, ...withVolume];

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
      const rawEndClose = withVolume.at(-1)?.close;
      const scale = rawEndClose ? s.price / rawEndClose : 1;

      const anchored: Candle[] = full.map((c) => {
        return {
          time: c.time,
          open: c.open * scale,
          high: c.high * scale,
          low: c.low * scale,
          close: c.close * scale,
          volume: c.volume,
        };
      });

      this.baseAnchors.set(`${symbol}|${timeframe}`, {
        backStartUnscaled: backAnchored[0]?.open ?? s.open,
        liveScale: scale,
        oldestTime: anchored[0]?.time ?? now,
        bucketMs,
      });

      return of(anchored as readonly Candle[]);
    });
  }

  candleHistory(
    symbol: string,
    timeframe: CandleTimeframe,
    beforeTime: number,
    count: number,
  ): Observable<readonly Candle[]> {
    return defer(() => {
      const s = this.getState(symbol);

      if (!s) {
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      }

      const key = `${symbol}|${timeframe}`;
      const deep =
        this.deepHistory.get(key) ?? this.buildDeepHistory(symbol, timeframe);
      this.deepHistory.set(key, deep);

      // Slice strictly-before beforeTime, newest `count` of what qualifies.
      let end = deep.length;

      while (end > 0 && (deep[end - 1] as Candle).time >= beforeTime) {
        end--;
      }

      return of(deep.slice(Math.max(0, end - count), end));
    });
  }

  /** Walks CANDLE_HISTORY_DEPTH_MAX − CANDLE_HISTORY_TOTAL buckets further
   * into the past from the base series' oldest candle, seam-rescaled to
   * chain into it — see the deepHistory field doc. */
  private buildDeepHistory(
    symbol: string,
    timeframe: CandleTimeframe,
  ): readonly Candle[] {
    const anchor = this.baseAnchors.get(`${symbol}|${timeframe}`);

    // No candles() emission yet for this key: nothing to chain to. Build
    // the anchor by generating the base series once (subscribing our own
    // candles() — synchronous via of()) and re-reading.
    if (!anchor) {
      this.candles(symbol, timeframe).subscribe().unsubscribe();
      const built = this.baseAnchors.get(`${symbol}|${timeframe}`);

      if (!built) {
        return [];
      }

      return this.walkDeepHistory(symbol, timeframe, built);
    }

    return this.walkDeepHistory(symbol, timeframe, anchor);
  }

  private walkDeepHistory(
    symbol: string,
    timeframe: CandleTimeframe,
    anchor: BaseAnchor,
  ): readonly Candle[] {
    const { vol, seed } = TF_CONFIG[timeframe];
    const substepVol = vol / Math.sqrt(CANDLE_SUBSTEPS);
    const depth = CANDLE_HISTORY_DEPTH_MAX - CANDLE_HISTORY_TOTAL;
    const rngDeep = mulberry32(seed + hashString(symbol) + DEEP_SEED_OFFSET);
    const volRngDeep = mulberry32(
      seed + hashString(symbol) + DEEP_SEED_OFFSET + VOLUME_SEED_OFFSET,
    );
    let price = anchor.backStartUnscaled;
    const out: Candle[] = [];

    // Oldest-first bucket times: depth buckets ending just before oldestTime.
    for (let i = depth; i >= 1; i--) {
      const bucketTime = anchor.oldestTime - i * anchor.bucketMs;
      let candle: Candle | null = null;

      for (let sub = 0; sub < CANDLE_SUBSTEPS; sub++) {
        price = gbmStep(price, rngDeep(), substepVol);
        candle = aggregateCandle(candle, price, bucketTime, anchor.bucketMs);
      }

      const built = candle as Candle;
      const range =
        built.close > 0 ? (built.high - built.low) / built.close : 0;
      out.push({
        ...built,
        volume: Math.round(
          BASE_VOLUME * (0.4 + volRngDeep()) * (1 + 40 * range),
        ),
      });
    }

    // Seam-rescale so the deep block's final close chains into the base
    // series' unscaled start, then apply the base's live-anchor scale so
    // the whole block lives in the same price space the client received.
    const endClose = out.at(-1)?.close;
    const seamScale = endClose ? anchor.backStartUnscaled / endClose : 1;
    const scale = seamScale * anchor.liveScale;

    return out.map((c) => {
      return {
        time: c.time,
        open: c.open * scale,
        high: c.high * scale,
        low: c.low * scale,
        close: c.close * scale,
        volume: c.volume,
      };
    });
  }

  depth(symbol: string): Observable<DepthBook> {
    return defer(() => {
      const s = this.getState(symbol);

      if (!s) {
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      }

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
