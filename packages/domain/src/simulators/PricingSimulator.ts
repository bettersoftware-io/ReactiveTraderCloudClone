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
import {
  advanceEpisode,
  burstSignBias,
  burstStepMultiplier,
  DEFAULT_EPISODE_CONFIG,
  type EpisodeState,
  NO_EPISODE,
  spreadFactor,
} from "./pricingAnomalyEpisode.js";

const MIN_TICK_INTERVAL_MS = 150;
const MAX_TICK_INTERVAL_MS = 1_000;

interface PairState {
  mid: number;
  history: PriceTick[];
  halfSpread: number;
  stepSize: number;
  ratePrecision: number;
  /**
   * Rare anomaly-episode state (see `pricingAnomalyEpisode.ts`) — the
   * narrator's only trigger source. Advanced once per LIVE tick only; the
   * history-seeding walk in `initPair` never touches it, so it stays
   * `NO_EPISODE` for every seeded/pinned tick (RFQ quotes likewise never
   * consult it — a quote is a point-in-time snapshot, not a live tick).
   */
  episode: EpisodeState;
}

/** Pip unit: 10^-pipsPosition (0.01 for JPY-quoted pairs, 0.0001 otherwise). */
function pipUnit(pipsPosition: number): number {
  return 10 ** -pipsPosition;
}

/** PROTO tick step (dc.html L1132): 0.02 for JPY-quoted pairs, 0.00018 otherwise. */
function stepSizeFor(pair: CurrencyPair): number {
  return pair.pipsPosition === 2 ? 2 * pipUnit(2) : 1.8 * pipUnit(4);
}

/**
 * `stepMultiplier`/`signBias` default to the neutral values (1, 0), so a
 * call site that never touches episodes computes byte-identically to the
 * original single-argument formula — see `pricingAnomalyEpisode.ts`'s
 * module doc for why this matters (the steady-state RNG byte-compat pin).
 */
function applyRandomWalk(
  state: PairState,
  random: () => number,
  stepMultiplier = 1,
  signBias: -1 | 0 | 1 = 0,
): number {
  const raw = random() - 0.5;
  const r = signBias === 0 ? raw : signBias * Math.abs(raw);
  const next = state.mid + r * state.stepSize * stepMultiplier;
  const rounded = Number(next.toFixed(state.ratePrecision));
  return rounded > 0 ? rounded : state.mid;
}

function createTick(
  symbol: string,
  state: PairState,
  timestamp: number,
  valueDateMs: number,
  spreadMultiplier = 1,
): PriceTick {
  const halfSpread = state.halfSpread * spreadMultiplier;
  return {
    symbol,
    mid: state.mid,
    ask: state.mid + halfSpread,
    bid: state.mid - halfSpread,
    // Taken from the caller's clock, not `new Date()` directly: under a pin
    // this must be the pinned instant. A tick that is deterministic in every
    // field EXCEPT a date derived from the wall clock is exactly the defect
    // that made `blotter/seeded` re-date itself every day (T32).
    valueDate: new Date(valueDateMs).toISOString().slice(0, 10),
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

  private readonly pinAtMs: number | undefined;

  /**
   * @param pinAtMs Freeze pricing at this instant. Omitted — which is what the
   * running desk wants — prices seed from a random walk off `Date.now()` and
   * then tick forever.
   *
   * A PIXEL-GOLDEN HARNESS MUST PASS ONE. Every price on screen is otherwise
   * doubly non-deterministic: `Math.random()` in the seed walk, and a live
   * `setTimeout` tick loop. `blotter/seeded` (T32) needed the same treatment
   * for one clock-derived field; a Rates grid is that problem in every cell,
   * which is why `rates` had no visual scenario at all until this existed.
   *
   * Pinned, the walk is skipped entirely rather than seeded from a fixed PRNG:
   * a scenario wants the grid AT REST at its reference prices, and a
   * reproducible-but-arbitrary random sequence would assert numbers no reader
   * could check against `KNOWN_CURRENCY_PAIRS`.
   */
  constructor(pinAtMs?: number) {
    this.pinAtMs = pinAtMs;

    for (const pair of KNOWN_CURRENCY_PAIRS) {
      this.initPair(pair);
    }
  }

  /** The pinned instant when frozen, otherwise the live clock. */
  private nowMs(): number {
    return this.pinAtMs ?? Date.now();
  }

  private initPair(pair: CurrencyPair): void {
    const state: PairState = {
      mid: pair.baseMid,
      history: [],
      halfSpread: (pair.typicalSpreadPips / 2) * pipUnit(pair.pipsPosition),
      stepSize: stepSizeFor(pair),
      ratePrecision: pair.ratePrecision,
      episode: NO_EPISODE,
    };
    const now = this.nowMs();

    for (let i = PRICE_HISTORY_SIZE - 1; i >= 0; i--) {
      if (this.pinAtMs === undefined) {
        state.mid = applyRandomWalk(state, Math.random);
      }

      const timestamp = now - i * 500; // ~500ms between historical ticks
      state.history.push(createTick(pair.symbol, state, timestamp, now));
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

      // Pinned: hand back the resting tick and stop. NOT an empty stream —
      // a subscriber that never receives anything renders the "no price yet"
      // branch, which is a different screen from the one a Rates golden is
      // meant to assert.
      if (this.pinAtMs !== undefined) {
        const at = this.pinAtMs;
        return of(createTick(symbol, pairState, at, at));
      }

      const live$ = new Observable<PriceTick>((subscriber) => {
        let timeoutId: ReturnType<typeof setTimeout>;

        function scheduleNext(): void {
          timeoutId = setTimeout(() => {
            // Episode state is advanced only on the LIVE path — the one
            // and only trigger source for the proactive narrator's
            // anomaly detector (see pricingAnomalyEpisode.ts). Seeded
            // history and RFQ quotes never call this.
            pairState.episode = advanceEpisode(
              pairState.episode,
              Math.random,
              DEFAULT_EPISODE_CONFIG,
            );
            const stepMultiplier = burstStepMultiplier(pairState.episode);
            const signBias = burstSignBias(pairState.episode);
            pairState.mid = applyRandomWalk(
              pairState,
              Math.random,
              stepMultiplier,
              signBias,
            );
            const now = Date.now();
            const tick = createTick(
              symbol,
              pairState,
              now,
              now,
              spreadFactor(pairState.episode),
            );
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
