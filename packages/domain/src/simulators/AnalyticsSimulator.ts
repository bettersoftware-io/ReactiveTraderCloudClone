import { concat, defer, interval, type Observable, of } from "rxjs";
import { map } from "rxjs/operators";

import type {
  CurrencyPairPosition,
  HistoricPosition,
  PositionUpdates,
} from "../analytics/position.js";
import type { AnalyticsPort } from "../ports/analyticsPort.js";

const HISTORY_SIZE = 90;
const UPDATE_INTERVAL_MS = 10_000;
const TIME_STEP_MS = 10_000;

/**
 * PROTO-scale demo book (spec §4.4). Per-currency aggregation via
 * netExposureByCurrency() lands exactly on the PROTO bubble values
 * (dc.html L1300): EUR +15.2M, USD -22.8M, JPY +8.4M, GBP -6.1M,
 * AUD +4.7M, CAD -3.2M, NZD +2.1M. basePnl values produce the PROTO
 * per-pair bars (dc.html L1302) after formatPnlK.
 */
const STATIC_POSITIONS: readonly CurrencyPairPosition[] = [
  {
    symbol: "EURUSD",
    basePnl: 13_000,
    baseTradedAmount: 6_200_000,
    counterTradedAmount: -6_800_000,
  },
  {
    symbol: "USDJPY",
    basePnl: -4_000,
    baseTradedAmount: -13_400_000,
    counterTradedAmount: 11_300_000,
  },
  {
    symbol: "GBPUSD",
    basePnl: 9_000,
    baseTradedAmount: -4_100_000,
    counterTradedAmount: 5_200_000,
  },
  {
    symbol: "GBPJPY",
    basePnl: -1_200,
    baseTradedAmount: -2_000_000,
    counterTradedAmount: 1_400_000,
  },
  {
    symbol: "EURJPY",
    basePnl: 5_000,
    baseTradedAmount: 4_000_000,
    counterTradedAmount: -4_300_000,
  },
  {
    symbol: "AUDUSD",
    basePnl: 6_000,
    baseTradedAmount: 6_000_000,
    counterTradedAmount: -6_500_000,
  },
  {
    symbol: "NZDUSD",
    basePnl: 800,
    baseTradedAmount: 2_100_000,
    counterTradedAmount: -1_300_000,
  },
  {
    symbol: "EURCAD",
    basePnl: -2_000,
    baseTradedAmount: 3_100_000,
    counterTradedAmount: -3_200_000,
  },
  {
    symbol: "EURAUD",
    basePnl: -600,
    baseTradedAmount: 1_900_000,
    counterTradedAmount: -1_300_000,
  },
];

function randomWalkStep(value: number): number {
  return value * (1 + (Math.random() - 0.5) / 100);
}

/** Per-step noise, as a fraction of a position's calibrated magnitude. */
const DRIFT_NOISE = 0.04;

/** How strongly each step is pulled back toward the calibrated value. */
const DRIFT_PULL = 0.15;

/**
 * One mean-reverting step for a position field.
 *
 * Mean-reverting rather than a free random walk on purpose: `STATIC_POSITIONS`
 * is calibrated so `netExposureByCurrency()` lands on the prototype's published
 * bubble figures, and an unbounded walk would eventually let one currency swamp
 * the bubble layout and push the pair bars off scale. Pulling back toward the
 * origin each step keeps the book recognisably the demo book however long the
 * app runs — steady-state deviation settles around ±(DRIFT_NOISE / DRIFT_PULL)
 * of the origin.
 */
function driftStep(current: number, origin: number): number {
  const noise = (Math.random() - 0.5) * Math.abs(origin) * DRIFT_NOISE;
  return current + (origin - current) * DRIFT_PULL + noise;
}

/**
 * Advance the whole book one step, returning a NEW array of NEW objects.
 *
 * Freshness is load-bearing, not stylistic: `PositionUpdates` flows into React,
 * so mutating the previous array in place would leave referential equality
 * intact and nothing would re-render — the surfaces would look exactly as
 * frozen as they did before this fix, with no error anywhere.
 */
function driftPositions(
  current: readonly CurrencyPairPosition[],
  origin: readonly CurrencyPairPosition[],
): readonly CurrencyPairPosition[] {
  return current.map((position, index) => {
    const from = origin[index];
    return {
      symbol: position.symbol,
      basePnl: driftStep(position.basePnl, from.basePnl),
      baseTradedAmount: driftStep(
        position.baseTradedAmount,
        from.baseTradedAmount,
      ),
      counterTradedAmount: driftStep(
        position.counterTradedAmount,
        from.counterTradedAmount,
      ),
    };
  });
}

export class AnalyticsSimulator implements AnalyticsPort {
  private history: HistoricPosition[] = [];

  private currentPrice: number;

  /**
   * The live book. Seeded from `STATIC_POSITIONS` so the FIRST emission is
   * byte-identical to the calibrated values — every pinned visual golden and
   * the prototype net-exposure assertions depend on that — and drifted only on
   * subsequent ticks.
   */
  private positions: readonly CurrencyPairPosition[] = STATIC_POSITIONS;

  constructor() {
    // PROTO headline P&L seed (dc.html L816: pnl: 17120).
    this.currentPrice = 17_120;

    const now = Date.now();

    // Generate 90 points in chronological order (oldest first)
    for (let i = HISTORY_SIZE - 1; i >= 0; i--) {
      this.currentPrice = randomWalkStep(this.currentPrice);
      this.history.push({
        timestamp: new Date(now - i * TIME_STEP_MS).toISOString(),
        usdPnl: this.currentPrice,
      });
    }
  }

  getAnalytics(_currency: string): Observable<PositionUpdates> {
    return defer(() => {
      const initial: PositionUpdates = {
        currentPositions: this.positions,
        history: [...this.history],
      };

      const updates$ = interval(UPDATE_INTERVAL_MS).pipe(
        map<number, PositionUpdates>(() => {
          this.currentPrice = randomWalkStep(this.currentPrice);
          this.history.push({
            timestamp: new Date().toISOString(),
            usdPnl: this.currentPrice,
          });

          if (this.history.length > HISTORY_SIZE) {
            this.history.shift();
          }

          this.positions = driftPositions(this.positions, STATIC_POSITIONS);

          return {
            currentPositions: this.positions,
            history: [...this.history],
          };
        }),
      );
      return concat(of(initial), updates$);
    });
  }
}
