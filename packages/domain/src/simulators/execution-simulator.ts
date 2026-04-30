import type { ExecutionRequest, Trade } from "../fx/trade.js";
import type { ExecutionPort } from "../ports/execution-port.js";
import { TradeStatus } from "../fx/trade.js";
import { delay } from "./delay.js";

const REJECTED_PAIR = "GBPJPY";
const DELAYED_PAIR = "EURJPY";
const DELAYED_PAIR_MS = 4_000;
const NORMAL_MAX_DELAY_MS = 2_000;
const DEFAULT_TRADER_NAME = "RTC";

export type TradeListener = (trade: Trade) => void;

export class ExecutionSimulator implements ExecutionPort {
  private nextId = 1;
  private readonly listeners: TradeListener[] = [];

  onTrade(listener: TradeListener): void {
    this.listeners.push(listener);
  }

  async executeTrade(request: ExecutionRequest): Promise<Trade> {
    const tradeId = this.nextId++;
    const now = new Date().toISOString().slice(0, 10);

    // Determine delay and status based on pair
    let delayMs: number;
    let status: TradeStatus;

    if (request.currencyPair === REJECTED_PAIR) {
      status = TradeStatus.Rejected;
      delayMs = Math.random() * NORMAL_MAX_DELAY_MS;
    } else if (request.currencyPair === DELAYED_PAIR) {
      status = TradeStatus.Done;
      delayMs = DELAYED_PAIR_MS;
    } else {
      status = TradeStatus.Done;
      delayMs = Math.random() * NORMAL_MAX_DELAY_MS;
    }

    await delay(delayMs);

    const trade: Trade = {
      tradeId,
      tradeName: DEFAULT_TRADER_NAME,
      currencyPair: request.currencyPair,
      notional: request.notional,
      dealtCurrency: request.dealtCurrency,
      direction: request.direction,
      spotRate: request.spotRate,
      status,
      tradeDate: now,
      valueDate: now,
    };

    // Notify listeners (trade store picks these up)
    for (const listener of this.listeners) {
      listener(trade);
    }

    return trade;
  }
}
