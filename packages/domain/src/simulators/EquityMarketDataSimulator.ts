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

  candles(symbol: string): Observable<readonly Candle[]> {
    return defer(() => {
      const s = this.getState(symbol);
      if (!s)
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      const rng = mulberry32(7);
      let price = s.open;
      let candle: Candle | null = null;
      const out: Candle[] = [];
      const now = Date.now();

      for (let i = CANDLE_HISTORY - 1; i >= 0; i--) {
        const t = now - i * CANDLE_BUCKET_MS;
        price = gbmStep(price, rng(), VOL * 4);
        candle = aggregateCandle(candle, price, t, CANDLE_BUCKET_MS);

        if (
          i === 0 ||
          Math.floor((now - (i - 1) * CANDLE_BUCKET_MS) / CANDLE_BUCKET_MS) !==
            Math.floor(t / CANDLE_BUCKET_MS)
        ) {
          out.push(candle);
        }
      }

      return of(out as readonly Candle[]);
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
