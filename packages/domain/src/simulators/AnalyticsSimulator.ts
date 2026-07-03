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

export class AnalyticsSimulator implements AnalyticsPort {
  private history: HistoricPosition[] = [];

  private currentPrice: number;

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
        currentPositions: STATIC_POSITIONS,
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

          return {
            currentPositions: STATIC_POSITIONS,
            history: [...this.history],
          };
        }),
      );
      return concat(of(initial), updates$);
    });
  }
}
