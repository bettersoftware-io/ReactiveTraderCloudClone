import type { ExecutionPort } from "../ports/execution-port.js";
import type { CurrencyPair } from "../fx/currency-pair.js";
import type { Price } from "../fx/price.js";
import type { Trade, ExecutionRequest } from "../fx/trade.js";
import {
  Direction,
  TradeStatus,
  ExecutionStatus,
  deriveDealtCurrency,
} from "../fx/trade.js";

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

  async execute(input: ExecuteTradeInput): Promise<ExecuteTradeResult> {
    const spotRate =
      input.direction === Direction.Buy ? input.price.ask : input.price.bid;
    const dealtCurrency = deriveDealtCurrency(input.pair.symbol, input.direction);
    const request: ExecutionRequest = {
      currencyPair: input.pair.symbol,
      spotRate,
      direction: input.direction,
      notional: input.notional,
      dealtCurrency,
    };
    const trade = await this.execution.executeTrade(request);
    const status =
      trade.status === TradeStatus.Rejected
        ? ExecutionStatus.Rejected
        : ExecutionStatus.Done;
    return { trade, status };
  }
}
