import { Observable, of, defer, throwError, concat, from, map, timer } from "rxjs";
import type { PriceTick } from "../fx/price.js";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { PricingPort, RfqQuoteResult } from "../ports/pricingPort.js";
import { KNOWN_CURRENCY_PAIRS } from "../fx/currencyPair.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";

const HALF_SPREAD = 0.0002;
const MIN_TICK_INTERVAL_MS = 150;
const MAX_TICK_INTERVAL_MS = 1_000;

interface PairState {
  mid: number;
  history: PriceTick[];
}

function generateInitialMid(): number {
  return Math.trunc(Math.random() * 1_000_000) / 100_000;
}

function applyRandomWalk(mid: number): number {
  return mid * (1 + (Math.random() > 0.5 ? 0.0001 : -0.0001));
}

function createTick(symbol: string, mid: number, timestamp: number): PriceTick {
  return {
    symbol,
    mid,
    ask: mid + HALF_SPREAD,
    bid: mid - HALF_SPREAD,
    valueDate: new Date().toISOString().slice(0, 10),
    creationTimestamp: timestamp,
  };
}

function tickInterval(): number {
  return Math.max(MIN_TICK_INTERVAL_MS, Math.random() * MAX_TICK_INTERVAL_MS);
}

export class PricingSimulator implements PricingPort {
  private readonly pairs = new Map<string, PairState>();

  constructor() {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      this.initPair(pair);
    }
  }

  private initPair(pair: CurrencyPair): void {
    let mid = generateInitialMid();
    const now = Date.now();
    const history: PriceTick[] = [];

    for (let i = PRICE_HISTORY_SIZE - 1; i >= 0; i--) {
      mid = applyRandomWalk(mid);
      const timestamp = now - i * 500; // ~500ms between historical ticks
      history.push(createTick(pair.symbol, mid, timestamp));
    }

    this.pairs.set(pair.symbol, { mid, history });
  }

  getPriceHistory(symbol: string): Observable<readonly PriceTick[]> {
    return defer(() => {
      const state = this.pairs.get(symbol);
      if (!state) return throwError(() => new Error(`Unknown symbol: ${symbol}`));
      return of([...state.history] as readonly PriceTick[]);
    });
  }

  getPriceUpdates(symbol: string): Observable<PriceTick> {
    return defer(() => {
      const state = this.pairs.get(symbol);
      if (!state) return throwError(() => new Error(`Unknown symbol: ${symbol}`));
      const live$ = new Observable<PriceTick>((subscriber) => {
        let timeoutId: ReturnType<typeof setTimeout>;
        const scheduleNext = () => {
          timeoutId = setTimeout(() => {
            state.mid = applyRandomWalk(state.mid);
            const tick = createTick(symbol, state.mid, Date.now());
            state.history.push(tick);
            if (state.history.length > PRICE_HISTORY_SIZE) state.history.shift();
            subscriber.next(tick);
            scheduleNext();
          }, tickInterval());
        };
        scheduleNext();
        return () => clearTimeout(timeoutId);
      });
      return concat(from(state.history), live$);
    });
  }

  /**
   * Generate an RFQ quote with widened spread.
   * priceChange = 0.3 / 10^pipsPosition
   * Emits after a 500–2000 ms artificial delay (simulates network/pricing engine latency).
   */
  getRfqQuote(symbol: string, pipsPosition: number): Observable<RfqQuoteResult> {
    return defer(() => {
      const state = this.pairs.get(symbol);
      if (!state) return throwError(() => new Error(`Unknown symbol: ${symbol}`));
      const priceChange = 0.3 / Math.pow(10, pipsPosition);
      const delayMs = 500 + Math.floor(Math.random() * 1500);
      const result: RfqQuoteResult = {
        ask: state.mid + HALF_SPREAD + priceChange,
        bid: state.mid - HALF_SPREAD - priceChange,
        mid: state.mid,
      };
      return timer(delayMs).pipe(map(() => result));
    });
  }
}
