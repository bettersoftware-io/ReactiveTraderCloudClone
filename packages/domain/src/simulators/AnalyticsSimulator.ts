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

const STATIC_POSITIONS: readonly CurrencyPairPosition[] = [
  {
    symbol: "EURUSD",
    basePnl: 564.97,
    baseTradedAmount: -2_000_000,
    counterTradedAmount: 2_726_570,
  },
  {
    symbol: "USDJPY",
    basePnl: 1382.31,
    baseTradedAmount: -1_000_000,
    counterTradedAmount: 102_144_000,
  },
  {
    symbol: "GBPUSD",
    basePnl: -1656.82,
    baseTradedAmount: -1_000_000,
    counterTradedAmount: 1_638_980,
  },
  { symbol: "GBPJPY", basePnl: 0, baseTradedAmount: 0, counterTradedAmount: 0 },
  { symbol: "EURJPY", basePnl: 0, baseTradedAmount: 0, counterTradedAmount: 0 },
  { symbol: "AUDUSD", basePnl: 0, baseTradedAmount: 0, counterTradedAmount: 0 },
  { symbol: "NZDUSD", basePnl: 0, baseTradedAmount: 0, counterTradedAmount: 0 },
  { symbol: "EURCAD", basePnl: 0, baseTradedAmount: 0, counterTradedAmount: 0 },
  { symbol: "EURAUD", basePnl: 0, baseTradedAmount: 0, counterTradedAmount: 0 },
];

function randomWalkStep(value: number): number {
  return value * (1 + (Math.random() - 0.5) / 100);
}

export class AnalyticsSimulator implements AnalyticsPort {
  private history: HistoricPosition[] = [];
  private currentPrice: number;

  constructor() {
    // Random initial value between -5000 and +5000
    this.currentPrice = (Math.random() - 0.5) * 10_000;

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
