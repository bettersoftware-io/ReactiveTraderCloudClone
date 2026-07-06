import { defer, type Observable, timer } from "rxjs";
import { map, tap } from "rxjs/operators";

import type { ExecutionRequest, Trade } from "../fx/trade.js";
import {
  isoDaysFromNow,
  SPOT_VALUE_DATE_OFFSET_DAYS,
  TradeStatus,
} from "../fx/trade.js";
import type { ExecutionPort } from "../ports/executionPort.js";

const REJECTED_PAIR = "GBPJPY";
const DELAYED_PAIR = "EURJPY";
const DELAYED_PAIR_MS = 4_000;
const NORMAL_MAX_DELAY_MS = 2_000;
// User-executed trades (as opposed to the PROTO seed trades in
// TradeStoreSimulator, which keep their own tradeName per SEED_TRADES) are
// always attributed to the local user, "You" — this is the only trader this
// client can execute as. Exported so other consumers (e.g. BlotterPresenter's
// live-activity derivation) can distinguish live executions from seeded
// history by this same domain-provided name, instead of a magic id threshold.
export const DEFAULT_TRADER_NAME = "You";

export type TradeListener = (trade: Trade) => void;

export class ExecutionSimulator implements ExecutionPort {
  // PROTO fxSeq (dc.html L784): live trades continue after seed ids 1038-1042.
  private nextId = 1043;

  private readonly listeners: TradeListener[] = [];

  onTrade(listener: TradeListener): void {
    this.listeners.push(listener);
  }

  executeTrade(request: ExecutionRequest): Observable<Trade> {
    return defer(() => {
      const tradeId = this.nextId++;
      const nowMs = Date.now();
      const tradeDate = isoDaysFromNow(0, nowMs);
      const valueDate = isoDaysFromNow(SPOT_VALUE_DATE_OFFSET_DAYS, nowMs);
      const status =
        request.currencyPair === REJECTED_PAIR
          ? TradeStatus.Rejected
          : TradeStatus.Done;
      const delayMs =
        request.currencyPair === DELAYED_PAIR
          ? DELAYED_PAIR_MS
          : Math.random() * NORMAL_MAX_DELAY_MS;
      return timer(delayMs).pipe(
        map<number, Trade>(() => {
          return {
            tradeId,
            tradeName: DEFAULT_TRADER_NAME,
            currencyPair: request.currencyPair,
            notional: request.notional,
            dealtCurrency: request.dealtCurrency,
            direction: request.direction,
            spotRate: request.spotRate,
            status,
            tradeDate,
            valueDate,
          };
        }),
        tap((trade) => {
          for (const listener of this.listeners) listener(trade);
        }),
      );
    });
  }
}
