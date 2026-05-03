import { type Observable, defer, timer } from "rxjs";
import { map, tap } from "rxjs/operators";
import type { ExecutionRequest, Trade } from "../fx/trade.js";
import type { ExecutionPort } from "../ports/executionPort.js";
import { TradeStatus } from "../fx/trade.js";

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

  executeTrade(request: ExecutionRequest): Observable<Trade> {
    return defer(() => {
      const tradeId = this.nextId++;
      const now = new Date().toISOString().slice(0, 10);
      const status =
        request.currencyPair === REJECTED_PAIR
          ? TradeStatus.Rejected
          : TradeStatus.Done;
      const delayMs =
        request.currencyPair === DELAYED_PAIR
          ? DELAYED_PAIR_MS
          : Math.random() * NORMAL_MAX_DELAY_MS;
      return timer(delayMs).pipe(
        map<number, Trade>(() => ({
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
        })),
        tap((trade) => {
          for (const listener of this.listeners) listener(trade);
        }),
      );
    });
  }
}
