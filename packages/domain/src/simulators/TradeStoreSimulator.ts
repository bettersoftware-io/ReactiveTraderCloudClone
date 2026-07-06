import { concat, defer, type Observable, of, Subject } from "rxjs";

import type { Trade } from "../fx/trade.js";
import {
  Direction,
  isoDaysFromNow,
  SPOT_VALUE_DATE_OFFSET_DAYS,
  TradeStatus,
} from "../fx/trade.js";
import type { BlotterPort } from "../ports/blotterPort.js";
import type { ExecutionSimulator } from "./ExecutionSimulator.js";

interface SeedSpec {
  readonly tradeId: number;
  readonly status: TradeStatus;
  readonly direction: Direction;
  readonly currencyPair: string;
  readonly dealtCurrency: string;
  readonly notional: number;
  readonly spotRate: number;
  readonly tradeName: string;
  readonly daysAgo: number;
}

/** PROTO seeded FX blotter (dc.html L818/L834). Rates are the pairs' base mids. */
const SEED_TRADES: readonly SeedSpec[] = [
  {
    tradeId: 1042,
    status: TradeStatus.Done,
    direction: Direction.Buy,
    currencyPair: "EURUSD",
    dealtCurrency: "EUR",
    notional: 1_000_000,
    spotRate: 1.09213,
    tradeName: "A.Stark",
    daysAgo: 3,
  },
  {
    tradeId: 1041,
    status: TradeStatus.Done,
    direction: Direction.Sell,
    currencyPair: "USDJPY",
    dealtCurrency: "USD",
    notional: 2_000_000,
    spotRate: 151.203,
    tradeName: "A.Stark",
    daysAgo: 3,
  },
  {
    tradeId: 1040,
    status: TradeStatus.Rejected,
    direction: Direction.Buy,
    currencyPair: "GBPUSD",
    dealtCurrency: "GBP",
    notional: 500_000,
    spotRate: 1.26414,
    tradeName: "N.Romanoff",
    daysAgo: 4,
  },
  {
    tradeId: 1039,
    status: TradeStatus.Done,
    direction: Direction.Sell,
    currencyPair: "EURJPY",
    dealtCurrency: "EUR",
    notional: 1_500_000,
    spotRate: 165.142,
    tradeName: "S.Rogers",
    daysAgo: 5,
  },
  {
    tradeId: 1038,
    status: TradeStatus.Done,
    direction: Direction.Buy,
    currencyPair: "AUDUSD",
    dealtCurrency: "AUD",
    notional: 3_000_000,
    spotRate: 0.66121,
    tradeName: "B.Banner",
    daysAgo: 6,
  },
];

function seedTrade(spec: SeedSpec): Trade {
  return {
    tradeId: spec.tradeId,
    tradeName: spec.tradeName,
    currencyPair: spec.currencyPair,
    notional: spec.notional,
    dealtCurrency: spec.dealtCurrency,
    direction: spec.direction,
    spotRate: spec.spotRate,
    status: spec.status,
    tradeDate: isoDaysFromNow(-spec.daysAgo),
    valueDate: isoDaysFromNow(-spec.daysAgo + SPOT_VALUE_DATE_OFFSET_DAYS),
  };
}

/**
 * Mock trade store that accumulates trades from the execution engine.
 * In mock mode, the blotter does NOT subscribe to a BlotterService —
 * it accumulates from the local execution stream instead.
 */
export class TradeStoreSimulator implements BlotterPort {
  private readonly trades = new Map<number, Trade>();

  private readonly snapshots$ = new Subject<readonly Trade[]>();

  constructor(executionEngine: ExecutionSimulator) {
    for (const spec of [...SEED_TRADES].sort((a, b) => {
      return a.tradeId - b.tradeId;
    })) {
      this.trades.set(spec.tradeId, seedTrade(spec));
    }

    executionEngine.onTrade((trade) => {
      this.trades.set(trade.tradeId, trade);
      this.snapshots$.next(this.snapshot());
    });
  }

  getTradeStream(): Observable<readonly Trade[]> {
    return defer(() => {
      return concat(of(this.snapshot()), this.snapshots$.asObservable());
    });
  }

  private snapshot(): readonly Trade[] {
    // Reverse insertion order (newest first)
    return [...this.trades.values()].reverse();
  }
}
