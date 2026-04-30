import type { Trade } from "../fx/trade.js";
import type { BlotterPort } from "../ports/blotter-port.js";
import type { ExecutionSimulator } from "./execution-simulator.js";

/**
 * Mock trade store that accumulates trades from the execution engine.
 * In mock mode, the blotter does NOT subscribe to a BlotterService —
 * it accumulates from the local execution stream instead.
 */
export class TradeStoreSimulator implements BlotterPort {
  private readonly trades = new Map<number, Trade>();
  private pendingResolve: ((value: void) => void) | null = null;

  constructor(executionEngine: ExecutionSimulator) {
    executionEngine.onTrade((trade) => {
      this.trades.set(trade.tradeId, trade);
      // Wake up any waiting consumer
      if (this.pendingResolve) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        resolve();
      }
    });
  }

  async *getTradeStream(): AsyncIterable<readonly Trade[]> {
    // Emit initial empty state
    yield this.snapshot();

    // Then yield on each new trade
    while (true) {
      await new Promise<void>((resolve) => {
        this.pendingResolve = resolve;
      });
      yield this.snapshot();
    }
  }

  private snapshot(): readonly Trade[] {
    // Reverse insertion order (newest first)
    return [...this.trades.values()].reverse();
  }
}
