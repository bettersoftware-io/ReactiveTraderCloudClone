import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type { ExecutionOutcome } from "@rtc/core-api";
import {
  type CurrencyPair,
  Direction,
  type ExecuteTradeResult,
  type ExecutionPort,
  type ExecutionRequest,
  ExecutionStatus,
  KNOWN_CURRENCY_PAIRS,
  type Price,
  PriceMovementType,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createTradeExecutionPresenter } from "#/presenters/execution";

describe("createTradeExecutionPresenter", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("execute() subscribes the port only when subscribed, and unsubscribing withdraws the request", async () => {
    const port = createPort();
    const p = createTradeExecutionPresenter(useHost(), port.execution);
    const command = p.execute({
      pair: EURUSD,
      direction: Direction.Buy,
      price: PRICE,
      notional: 1_000_000,
    });
    await tick();
    expect(port.pending()).toEqual([]);
    const sub = command.subscribe(() => {});
    await tick();
    expect(port.pending()).toHaveLength(1);
    expect(port.pending()[0]?.spotRate).toBe(PRICE.ask);
    sub.unsubscribe();
    await tick();
    expect(port.pending()).toEqual([]);
  });

  it("a result is emitted, the stream completes, and the outcome reaches executions$", async () => {
    const port = createPort();
    const p = createTradeExecutionPresenter(useHost(), port.execution);
    const outcomes: ExecutionOutcome[] = [];
    p.executions$.subscribe((outcome: ExecutionOutcome) => {
      outcomes.push(outcome);
    });
    await tick();
    const results: ExecuteTradeResult[] = [];
    let completed = false;
    p.execute({
      pair: EURUSD,
      direction: Direction.Buy,
      price: PRICE,
      notional: 1,
    }).subscribe({
      next: (result: ExecuteTradeResult) => {
        results.push(result);
      },
      complete: () => {
        completed = true;
      },
    });
    await tick();
    port.resolve(createTrade(TradeStatus.Done));
    await tick();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe(ExecutionStatus.Done);
    expect(completed).toBe(true);
    expect(outcomes).toEqual([
      { symbol: "EURUSD", status: ExecutionStatus.Done },
    ]);
  });

  it("executions$ reaches only fibers subscribed before the publish", async () => {
    const port = createPort();
    const p = createTradeExecutionPresenter(useHost(), port.execution);
    p.execute({
      pair: EURUSD,
      direction: Direction.Buy,
      price: PRICE,
      notional: 1,
    }).subscribe(() => {});
    await tick();
    port.resolve(createTrade(TradeStatus.Done));
    await tick();
    const late: ExecutionOutcome[] = [];
    p.executions$.subscribe((outcome: ExecutionOutcome) => {
      late.push(outcome);
    });
    await tick();
    expect(late).toEqual([]);
  });

  it("a failing command errors the result and publishes nothing", async () => {
    const port = createPort();
    const p = createTradeExecutionPresenter(useHost(), port.execution);
    const outcomes: ExecutionOutcome[] = [];
    p.executions$.subscribe((outcome: ExecutionOutcome) => {
      outcomes.push(outcome);
    });
    await tick();
    const errors: unknown[] = [];
    p.execute({
      pair: EURUSD,
      direction: Direction.Sell,
      price: PRICE,
      notional: 1,
    }).subscribe({
      next: () => {},
      error: (error: unknown) => {
        errors.push(error);
      },
    });
    await tick();
    port.fail(new Error("bust"));
    await tick();
    expect(errors).toHaveLength(1);
    expect(outcomes).toEqual([]);
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

interface PendingExecution {
  request: ExecutionRequest;
  result: Subject<Trade>;
}

interface TestPort {
  execution: ExecutionPort;
  pending: () => readonly ExecutionRequest[];
  resolve: (trade: Trade) => void;
  fail: (error: unknown) => void;
}

function createPort(): TestPort {
  const pending: PendingExecution[] = [];

  function settle(apply: (result: Subject<Trade>) => void): void {
    const oldest = pending.shift();

    if (oldest !== undefined) {
      apply(oldest.result);
    }
  }

  return {
    execution: {
      executeTrade: (request: ExecutionRequest) => {
        return new Observable<Trade>((subscriber) => {
          const entry: PendingExecution = {
            request,
            result: new Subject<Trade>(),
          };
          pending.push(entry);
          const inner = entry.result.subscribe(subscriber);

          return () => {
            inner.unsubscribe();
            const index = pending.indexOf(entry);

            if (index >= 0) {
              pending.splice(index, 1);
            }
          };
        });
      },
    },
    pending: () => {
      return pending.map((entry) => {
        return entry.request;
      });
    },
    resolve: (trade: Trade) => {
      settle((result) => {
        result.next(trade);
        result.complete();
      });
    },
    fail: (error: unknown) => {
      settle((result) => {
        result.error(error);
      });
    },
  };
}

function createPrice(mid: number): Price {
  return {
    symbol: "EURUSD",
    bid: mid - 0.00005,
    ask: mid + 0.00005,
    mid,
    valueDate: "2026-01-03",
    creationTimestamp: 0,
    movementType: PriceMovementType.NONE,
    spread: "1.0",
  };
}

function createTrade(status: TradeStatus): Trade {
  return {
    tradeId: 7,
    tradeName: "A.Stark",
    currencyPair: "EURUSD",
    notional: 1,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.1,
    status,
    tradeDate: "2026-01-01",
    valueDate: "2026-01-03",
  };
}

function findPair(symbol: string): CurrencyPair {
  const pair = KNOWN_CURRENCY_PAIRS.find((candidate) => {
    return candidate.symbol === symbol;
  });

  if (pair === undefined) {
    throw new Error(`${symbol} is not a known currency pair`);
  }

  return pair;
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const EURUSD = findPair("EURUSD");

const PRICE = createPrice(1.1);
