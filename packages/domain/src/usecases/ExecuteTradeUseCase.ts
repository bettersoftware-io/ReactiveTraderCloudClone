import type { Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { CurrencyPair } from "../fx/currencyPair.js";
import type { Price } from "../fx/price.js";
import type { ExecutionRequest, Trade } from "../fx/trade.js";
import {
  Direction,
  deriveDealtCurrency,
  ExecutionStatus,
  TradeStatus,
} from "../fx/trade.js";
import type { ExecutionPort } from "../ports/executionPort.js";

export interface ExecuteTradeInput {
  readonly pair: CurrencyPair;
  readonly direction: Direction;
  readonly price: Price;
  readonly notional: number;
}

export interface ExecuteTradeResult {
  readonly trade: Trade;
  readonly status: ExecutionStatus;
}

export class ExecuteTradeUseCase {
  constructor(private readonly execution: ExecutionPort) {}

  execute(input: ExecuteTradeInput): Observable<ExecuteTradeResult> {
    const spotRate =
      input.direction === Direction.Buy ? input.price.ask : input.price.bid;
    const dealtCurrency = deriveDealtCurrency(
      input.pair.symbol,
      input.direction,
    );
    const request: ExecutionRequest = {
      currencyPair: input.pair.symbol,
      spotRate,
      direction: input.direction,
      notional: input.notional,
      dealtCurrency,
    };
    return this.execution.executeTrade(request).pipe(
      map((trade) => ({
        trade,
        status:
          trade.status === TradeStatus.Rejected
            ? ExecutionStatus.Rejected
            : ExecutionStatus.Done,
      })),
    );
  }
}
