import { Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { ExecutionOutcome } from "@rtc/core-api";
import {
  type CurrencyPair,
  Direction,
  type ExecuteTradeInput,
  type ExecutionPort,
  KNOWN_CURRENCY_PAIRS,
  type Price,
  PriceMovementType,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import { createTradeExecutionPresenter } from "#/presenters/execution";

describe("createTradeExecutionPresenter (async)", () => {
  it("execute() subscribes the port only when its result is subscribed, and unsubscribing aborts the call", async () => {
    const { port, trades } = createPort();
    const presenter = createTradeExecutionPresenter(port);
    const result = presenter.execute(createInput());
    expect(trades.observed).toBe(false);
    const sub = result.subscribe(() => {});
    await tick();
    expect(trades.observed).toBe(true);
    sub.unsubscribe();
    expect(trades.observed).toBe(false);
  });

  it("executions$ reaches only subscribers present at publish time", async () => {
    const { port, trades } = createPort();
    const presenter = createTradeExecutionPresenter(port);
    const dropped: ExecutionOutcome[] = [];
    // No subscriber yet: this outcome reaches nobody and is not latched.
    const first = presenter.execute(createInput()).subscribe(() => {});
    await tick();
    trades.next(createTrade());
    await tick();
    first.unsubscribe();
    const late = presenter.executions$.subscribe((outcome) => {
      dropped.push(outcome);
    });
    expect(dropped).toEqual([]);
    late.unsubscribe();
  });

  interface PortFixture {
    port: ExecutionPort;
    trades: Subject<Trade>;
  }

  async function tick(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  function createInput(): ExecuteTradeInput {
    return {
      pair: EURUSD,
      direction: Direction.Buy,
      price: createPrice(),
      notional: 1,
    };
  }

  function createPrice(): Price {
    return {
      symbol: "EURUSD",
      bid: 1.1,
      ask: 1.1001,
      mid: 1.10005,
      valueDate: "2026-01-03",
      creationTimestamp: 0,
      movementType: PriceMovementType.NONE,
      spread: "1.0",
    };
  }

  function createTrade(): Trade {
    return {
      tradeId: 1,
      tradeName: "A.Stark",
      currencyPair: "EURUSD",
      notional: 1,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1.1,
      status: TradeStatus.Done,
      tradeDate: "2026-01-01",
      valueDate: "2026-01-03",
    };
  }

  function createPort(): PortFixture {
    const trades = new Subject<Trade>();
    return {
      trades,
      port: {
        executeTrade: () => {
          return new Observable<Trade>((subscriber) => {
            return trades.subscribe(subscriber);
          });
        },
      },
    };
  }
});

const EURUSD: CurrencyPair = KNOWN_CURRENCY_PAIRS[0];
