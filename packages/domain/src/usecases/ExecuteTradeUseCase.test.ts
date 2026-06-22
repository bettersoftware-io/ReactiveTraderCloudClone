import { firstValueFrom, of, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import type { CurrencyPair } from "../fx/currencyPair.js";
import type { Price } from "../fx/price.js";
import { PriceMovementType } from "../fx/price.js";
import type { ExecutionRequest, Trade } from "../fx/trade.js";
import { Direction, ExecutionStatus, TradeStatus } from "../fx/trade.js";
import type { ExecutionPort } from "../ports/executionPort.js";
import { ExecuteTradeUseCase } from "./ExecuteTradeUseCase.js";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
};

const PRICE: Price = {
  symbol: "EURUSD",
  bid: 1.1,
  ask: 1.1002,
  mid: 1.1001,
  valueDate: "2024-01-02",
  creationTimestamp: 1,
  movementType: PriceMovementType.UP,
  spread: "2.0",
};

interface LastRequestRef {
  current: ExecutionRequest | null;
}

interface StubExecution {
  port: ExecutionPort;
  lastRequest: LastRequestRef;
}

function stubExecution(trade: Trade): StubExecution {
  const lastRequest = { current: null as ExecutionRequest | null };
  const port: ExecutionPort = {
    executeTrade(request) {
      lastRequest.current = request;
      return of(trade);
    },
  };
  return { port, lastRequest };
}

function buildTrade(status: TradeStatus): Trade {
  return {
    tradeId: 42,
    currencyPair: "EURUSD",
    tradeName: "trader1",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.1002,
    status,
    valueDate: "2024-01-02",
    tradeDate: "2024-01-02",
  };
}

describe("ExecuteTradeUseCase", () => {
  it("for Direction.Buy uses ask as spot rate and base currency as dealt", async () => {
    const { port, lastRequest } = stubExecution(buildTrade(TradeStatus.Done));
    const useCase = new ExecuteTradeUseCase(port);

    const result = await firstValueFrom(
      useCase.execute({
        pair: EURUSD,
        direction: Direction.Buy,
        price: PRICE,
        notional: 1_000_000,
      }),
    );

    expect(lastRequest.current).toEqual({
      currencyPair: "EURUSD",
      spotRate: 1.1002,
      direction: Direction.Buy,
      notional: 1_000_000,
      dealtCurrency: "EUR",
    });
    expect(result.status).toBe(ExecutionStatus.Done);
    expect(result.trade.status).toBe(TradeStatus.Done);
  });

  it("for Direction.Sell uses bid as spot rate and terms currency as dealt", async () => {
    const { port, lastRequest } = stubExecution(buildTrade(TradeStatus.Done));
    const useCase = new ExecuteTradeUseCase(port);

    await firstValueFrom(
      useCase.execute({
        pair: EURUSD,
        direction: Direction.Sell,
        price: PRICE,
        notional: 1_000_000,
      }),
    );

    expect(lastRequest.current?.spotRate).toBe(1.1);
    expect(lastRequest.current?.dealtCurrency).toBe("USD");
    expect(lastRequest.current?.direction).toBe(Direction.Sell);
  });

  it("maps TradeStatus.Rejected to ExecutionStatus.Rejected", async () => {
    const { port } = stubExecution(buildTrade(TradeStatus.Rejected));
    const useCase = new ExecuteTradeUseCase(port);

    const result = await firstValueFrom(
      useCase.execute({
        pair: EURUSD,
        direction: Direction.Buy,
        price: PRICE,
        notional: 1_000_000,
      }),
    );

    expect(result.status).toBe(ExecutionStatus.Rejected);
    expect(result.trade.status).toBe(TradeStatus.Rejected);
  });

  it("propagates errors from the port (timeout handling stays in the hook)", async () => {
    const port: ExecutionPort = {
      executeTrade() {
        return throwError(() => {
          return new Error("timeout");
        });
      },
    };
    const useCase = new ExecuteTradeUseCase(port);

    await expect(
      firstValueFrom(
        useCase.execute({
          pair: EURUSD,
          direction: Direction.Buy,
          price: PRICE,
          notional: 1_000_000,
        }),
      ),
    ).rejects.toThrow("timeout");
  });
});
