import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type CurrencyPair,
  Direction,
  type ExecuteTradeInput,
  type ExecutionPort,
  ExecutionStatus,
  type Price,
  PriceMovementType,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import {
  type ExecutionOutcome,
  TradeExecutionPresenter,
} from "../TradeExecutionPresenter";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD",
  base: "EUR",
  terms: "USD",
  ratePrecision: 5,
  pipsPosition: 4,
  defaultNotional: 1_000_000,
};

const doneTrade: Trade = {
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

const rejectedTrade: Trade = {
  ...doneTrade,
  status: TradeStatus.Rejected,
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

const executeInput: ExecuteTradeInput = {
  pair: EURUSD,
  direction: Direction.Buy,
  price,
  notional: 1_000_000,
};

describe("TradeExecutionPresenter", () => {
  it("delegates to ExecuteTradeUseCase", async () => {
    const port: ExecutionPort = {
      executeTrade: () => {
        return of(doneTrade);
      },
    };

    const presenter = new TradeExecutionPresenter(port);

    const result = await firstValueFrom(presenter.execute(executeInput));

    expect(result.trade.tradeId).toBe(1);
    expect(result.status).toBe(ExecutionStatus.Done);
  });

  it("executions$ emits Done outcome when execute() result is subscribed and trade is Done", async () => {
    const port: ExecutionPort = {
      executeTrade: () => {
        return of(doneTrade);
      },
    };

    const presenter = new TradeExecutionPresenter(port);
    const seen: ExecutionOutcome[] = [];

    presenter.executions$.subscribe((o) => {
      seen.push(o);
    });

    await firstValueFrom(presenter.execute(executeInput));

    expect(seen).toEqual([{ symbol: "EURUSD", status: ExecutionStatus.Done }]);
  });

  it("executions$ emits Rejected outcome when trade is Rejected", async () => {
    const port: ExecutionPort = {
      executeTrade: () => {
        return of(rejectedTrade);
      },
    };

    const presenter = new TradeExecutionPresenter(port);
    const seen: ExecutionOutcome[] = [];

    presenter.executions$.subscribe((o) => {
      seen.push(o);
    });

    await firstValueFrom(presenter.execute(executeInput));

    expect(seen).toEqual([
      { symbol: "EURUSD", status: ExecutionStatus.Rejected },
    ]);
  });

  it("executions$ does NOT emit until execute() returned observable is subscribed", () => {
    const port: ExecutionPort = {
      executeTrade: () => {
        return of(doneTrade);
      },
    };

    const presenter = new TradeExecutionPresenter(port);
    const seen: ExecutionOutcome[] = [];

    presenter.executions$.subscribe((o) => {
      seen.push(o);
    });

    // Call execute() but do NOT subscribe to the returned observable
    presenter.execute(executeInput);

    expect(seen).toHaveLength(0);
  });
});
