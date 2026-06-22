import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type CurrencyPair,
  Direction,
  type ExecutionPort,
  ExecutionStatus,
  type Price,
  PriceMovementType,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import { TradeExecutionPresenter } from "../TradeExecutionPresenter";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD",
  base: "EUR",
  terms: "USD",
  ratePrecision: 5,
  pipsPosition: 4,
  defaultNotional: 1_000_000,
};

describe("TradeExecutionPresenter", () => {
  it("delegates to ExecuteTradeUseCase", async () => {
    const trade: Trade = {
      tradeId: 1,
      tradeName: "T1",
      currencyPair: "EURUSD",
      notional: 1_000_000,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1.1,
      status: TradeStatus.Done,
      tradeDate: "2026-05-05",
      valueDate: "2026-05-07",
    };
    const price: Price = {
      symbol: "EURUSD",
      mid: 1.1,
      ask: 1.1001,
      bid: 1.0999,
      valueDate: "2026-05-07",
      creationTimestamp: 1,
      movementType: PriceMovementType.NONE,
      spread: "1.0",
    };
    const port: ExecutionPort = {
      executeTrade: () => {
        return of(trade);
      },
    };
    const presenter = new TradeExecutionPresenter(port);
    const result = await firstValueFrom(
      presenter.execute({
        pair: EURUSD,
        direction: Direction.Buy,
        price,
        notional: 1_000_000,
      }),
    );
    expect(result.trade.tradeId).toBe(1);
    expect(result.status).toBe(ExecutionStatus.Done);
  });
});
