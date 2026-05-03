import { type Observable, Subject, defer, concat, of } from "rxjs";
import type { Trade } from "../fx/trade.js";
import type { BlotterPort } from "../ports/blotterPort.js";
import type { ExecutionSimulator } from "./ExecutionSimulator.js";

/**
 * Mock trade store that accumulates trades from the execution engine.
 * In mock mode, the blotter does NOT subscribe to a BlotterService —
 * it accumulates from the local execution stream instead.
 */
export class TradeStoreSimulator implements BlotterPort {
  private readonly trades = new Map<number, Trade>();
  private readonly snapshots$ = new Subject<readonly Trade[]>();

  constructor(executionEngine: ExecutionSimulator) {
    executionEngine.onTrade((trade) => {
      this.trades.set(trade.tradeId, trade);
      this.snapshots$.next(this.snapshot());
    });
  }

  getTradeStream(): Observable<readonly Trade[]> {
    return defer(() =>
      concat(of(this.snapshot()), this.snapshots$.asObservable()),
    );
  }

  private snapshot(): readonly Trade[] {
    // Reverse insertion order (newest first)
    return [...this.trades.values()].reverse();
  }
}
