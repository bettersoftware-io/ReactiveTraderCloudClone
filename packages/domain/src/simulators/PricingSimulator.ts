import {
  concat,
  defer,
  from,
  map,
  Observable,
  of,
  throwError,
  timer,
} from "rxjs";

import type { CurrencyPair } from "../fx/currencyPair.js";
import { KNOWN_CURRENCY_PAIRS } from "../fx/currencyPair.js";
import type { PriceTick } from "../fx/price.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";
import type { PricingPort, RfqQuoteResult } from "../ports/pricingPort.js";

const MIN_TICK_INTERVAL_MS = 150;
const MAX_TICK_INTERVAL_MS = 1_000;

interface PairState {
  mid: number;
  history: PriceTick[];
  halfSpread: number;
  stepSize: number;
  ratePrecision: number;
}

/** Pip unit: 10^-pipsPosition (0.01 for JPY-quoted pairs, 0.0001 otherwise). */
function pipUnit(pipsPosition: number): number {
  return 10 ** -pipsPosition;
}

/** PROTO tick step (dc.html L1132): 0.02 for JPY-quoted pairs, 0.00018 otherwise. */
function stepSizeFor(pair: CurrencyPair): number {
  return pair.pipsPosition === 2 ? 2 * pipUnit(2) : 1.8 * pipUnit(4);
}

function applyRandomWalk(state: PairState): number {
  const next = state.mid + (Math.random() - 0.5) * state.stepSize;
  const rounded = Number(next.toFixed(state.ratePrecision));
  return rounded > 0 ? rounded : state.mid;
}

function createTick(
  symbol: string,
  state: PairState,
  timestamp: number,
): PriceTick {
  return {
    symbol,
    mid: state.mid,
    ask: state.mid + state.halfSpread,
    bid: state.mid - state.halfSpread,
    valueDate: new Date().toISOString().slice(0, 10),
    creationTimestamp: timestamp,
  };
}

function tickInterval(): number {
  return Math.max(MIN_TICK_INTERVAL_MS, Math.random() * MAX_TICK_INTERVAL_MS);
}

/**
 * Pure RFQ artificial-delay computation, extracted so the 500–999 ms bound is
 * testable. Mirrors rtc-original packages/client/src/services/rfqs/rfqs.ts:13
 * (`delay(500 + Math.floor(Math.random() * 500))`).
 * @param rand a value in [0, 1) — pass Math.random() at the call site.
 * @returns integer delay in ms, in [500, 999].
 */
export function rfqResponseDelayMs(rand: number): number {
  return 500 + Math.floor(rand * 500);
}

export class PricingSimulator implements PricingPort {
  private readonly pairs = new Map<string, PairState>();

  constructor() {
    for (const pair of KNOWN_CURRENCY_PAIRS) {
      this.initPair(pair);
    }
  }

  private initPair(pair: CurrencyPair): void {
    const state: PairState = {
      mid: pair.baseMid,
      history: [],
      halfSpread: (pair.typicalSpreadPips / 2) * pipUnit(pair.pipsPosition),
      stepSize: stepSizeFor(pair),
      ratePrecision: pair.ratePrecision,
    };
    const now = Date.now();

    for (let i = PRICE_HISTORY_SIZE - 1; i >= 0; i--) {
      state.mid = applyRandomWalk(state);
      const timestamp = now - i * 500; // ~500ms between historical ticks
      state.history.push(createTick(pair.symbol, state, timestamp));
    }

    this.pairs.set(pair.symbol, state);
  }

  getPriceHistory(symbol: string): Observable<readonly PriceTick[]> {
    return defer(() => {
      const state = this.pairs.get(symbol);

      if (!state) {
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      }

      return of([...state.history] as readonly PriceTick[]);
    });
  }

  getPriceUpdates(symbol: string): Observable<PriceTick> {
    return defer(() => {
      const state = this.pairs.get(symbol);

      if (!state) {
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      }

      const pairState = state;
      const live$ = new Observable<PriceTick>((subscriber) => {
        let timeoutId: ReturnType<typeof setTimeout>;

        function scheduleNext(): void {
          timeoutId = setTimeout(() => {
            pairState.mid = applyRandomWalk(pairState);
            const tick = createTick(symbol, pairState, Date.now());
            pairState.history.push(tick);

            if (pairState.history.length > PRICE_HISTORY_SIZE) {
              pairState.history.shift();
            }

            subscriber.next(tick);
            scheduleNext();
          }, tickInterval());
        }

        scheduleNext();

        return (): void => {
          clearTimeout(timeoutId);
        };
      });
      return concat(from(state.history), live$);
    });
  }

  /**
   * Generate an RFQ quote with widened spread.
   * priceChange = 0.3 / 10^pipsPosition
   * Emits after a 500–999 ms artificial delay (simulates network/pricing engine latency).
   */
  getRfqQuote(
    symbol: string,
    pipsPosition: number,
  ): Observable<RfqQuoteResult> {
    return defer(() => {
      const state = this.pairs.get(symbol);

      if (!state) {
        return throwError(() => {
          return new Error(`Unknown symbol: ${symbol}`);
        });
      }

      const priceChange = 0.3 / 10 ** pipsPosition;
      const delayMs = rfqResponseDelayMs(Math.random());
      const result: RfqQuoteResult = {
        ask: state.mid + state.halfSpread + priceChange,
        bid: state.mid - state.halfSpread - priceChange,
        mid: state.mid,
      };
      return timer(delayMs).pipe(
        map(() => {
          return result;
        }),
      );
    });
  }
}
