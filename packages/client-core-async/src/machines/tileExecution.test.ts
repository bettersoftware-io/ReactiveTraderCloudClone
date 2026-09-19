import { Observable, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Stream, TileExecutionState } from "@rtc/core-api";
import {
  CONFIRMATION_DISMISS_MS,
  type CurrencyPair,
  Direction,
  EXECUTION_TIMEOUT_MS,
  type ExecuteTradeResult,
  ExecutionStatus,
  KNOWN_CURRENCY_PAIRS,
  type Price,
  PriceMovementType,
  TOO_LONG_THRESHOLD_MS,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import { createTileExecutionMachine } from "#/machines/tileExecution";

describe("createTileExecutionMachine (async)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ready → started → finished → ready after CONFIRMATION_DISMISS_MS", async () => {
    const { deps, calls } = createDeps();
    const m = createTileExecutionMachine(EURUSD, deps);
    const seen: TileExecutionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    expect(seen).toEqual([{ status: "ready" }]);
    m.intents.execute(Direction.Buy, createPrice(), 1);
    expect(statuses(seen)).toEqual(["ready", "started"]);
    await vi.advanceTimersByTimeAsync(0);
    calls[0]?.next(createResult());
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)?.status).toBe("finished");
    await vi.advanceTimersByTimeAsync(CONFIRMATION_DISMISS_MS);
    expect(statuses(seen)).toEqual(["ready", "started", "finished", "ready"]);
    sub.unsubscribe();
    m.dispose();
  });

  it("tooLong at TOO_LONG_THRESHOLD_MS, timeout at EXECUTION_TIMEOUT_MS, a late result ignored", async () => {
    const { deps, calls } = createDeps();
    const m = createTileExecutionMachine(EURUSD, deps);
    const seen: TileExecutionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    m.intents.execute(Direction.Buy, createPrice(), 1);
    await vi.advanceTimersByTimeAsync(TOO_LONG_THRESHOLD_MS);
    expect(seen.at(-1)?.status).toBe("tooLong");
    await vi.advanceTimersByTimeAsync(
      EXECUTION_TIMEOUT_MS - TOO_LONG_THRESHOLD_MS,
    );
    expect(seen.at(-1)?.status).toBe("timeout");
    // `Promise.race` cancels nothing, so the `once(...)` subscription stays
    // live until dismiss/new execute/dispose (RxJS parity) — held until
    // then, unlike the Effect core, which releases it at once via
    // `Effect.race`'s interrupt.
    expect(
      calls.filter((call) => {
        return call.observed;
      }).length,
    ).toBe(1);
    calls[0]?.next(createResult());
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)?.status).toBe("timeout");
    await vi.advanceTimersByTimeAsync(CONFIRMATION_DISMISS_MS);
    expect(statuses(seen)).toEqual([
      "ready",
      "started",
      "tooLong",
      "timeout",
      "ready",
    ]);
    sub.unsubscribe();
    m.dispose();
  });

  it("a failing command lands as finished{Timeout}, not the timeout state", async () => {
    const { deps, calls } = createDeps();
    const m = createTileExecutionMachine(EURUSD, deps);
    const seen: TileExecutionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    m.intents.execute(Direction.Buy, createPrice(), 1);
    await vi.advanceTimersByTimeAsync(0);
    calls[0]?.error(new Error("bust"));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)).toEqual({
      status: "finished",
      executionStatus: ExecutionStatus.Timeout,
    });
    sub.unsubscribe();
    m.dispose();
  });

  it("dismiss() aborts the in-flight call and returns to ready", async () => {
    const { deps, calls } = createDeps();
    const m = createTileExecutionMachine(EURUSD, deps);
    const seen: TileExecutionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    m.intents.execute(Direction.Buy, createPrice(), 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[0]?.observed).toBe(true);
    m.intents.dismiss();
    expect(calls[0]?.observed).toBe(false);
    expect(statuses(seen)).toEqual(["ready", "started", "ready"]);
    await vi.advanceTimersByTimeAsync(
      EXECUTION_TIMEOUT_MS + CONFIRMATION_DISMISS_MS,
    );
    expect(statuses(seen)).toEqual(["ready", "started", "ready"]);
    sub.unsubscribe();
    m.dispose();
  });

  it("a second execute() aborts the first call", async () => {
    const { deps, calls } = createDeps();
    const m = createTileExecutionMachine(EURUSD, deps);
    const sub = m.state$.subscribe(() => {});
    m.intents.execute(Direction.Buy, createPrice(), 1);
    await vi.advanceTimersByTimeAsync(0);
    m.intents.execute(Direction.Buy, createPrice(), 2);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[0]?.observed).toBe(false);
    expect(calls[1]?.observed).toBe(true);
    sub.unsubscribe();
    m.dispose();
  });

  it("dispose() aborts the in-flight run and leaves the state where it stood", async () => {
    const { deps, calls } = createDeps();
    const m = createTileExecutionMachine(EURUSD, deps);
    const sub = m.state$.subscribe(() => {});
    m.intents.execute(Direction.Buy, createPrice(), 1);
    await vi.advanceTimersByTimeAsync(0);
    sub.unsubscribe();
    m.dispose();
    expect(calls[0]?.observed).toBe(false);
    // dispose() ends the run; it does not rewind the state. A fresh
    // subscription reads the current value synchronously.
    const fresh: TileExecutionState[] = [];
    m.state$
      .subscribe((state) => {
        fresh.push(state);
      })
      .unsubscribe();
    expect(fresh).toEqual([{ status: "started" }]);
  });

  it("dispose() makes the intents inert: no further port call, no further state", async () => {
    const { deps, calls } = createDeps();
    const m = createTileExecutionMachine(EURUSD, deps);
    const seen: TileExecutionState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    sub.unsubscribe();
    m.dispose();
    m.intents.execute(Direction.Buy, createPrice(), 1);
    m.intents.dismiss();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([]);
    const fresh: TileExecutionState[] = [];
    m.state$
      .subscribe((state) => {
        fresh.push(state);
      })
      .unsubscribe();
    expect(fresh).toEqual([{ status: "ready" }]);
  });

  interface DepsFixture {
    deps: { execute: () => Stream<ExecuteTradeResult> };
    calls: Subject<ExecuteTradeResult>[];
  }

  function statuses(values: readonly TileExecutionState[]): string[] {
    return values.map((state) => {
      return state.status;
    });
  }

  function createDeps(): DepsFixture {
    const calls: Subject<ExecuteTradeResult>[] = [];
    return {
      calls,
      deps: {
        execute: () => {
          return new Observable<ExecuteTradeResult>((subscriber) => {
            const results = new Subject<ExecuteTradeResult>();
            calls.push(results);
            return results.subscribe(subscriber);
          });
        },
      },
    };
  }

  function createResult(): ExecuteTradeResult {
    return { trade: createTrade(), status: ExecutionStatus.Done };
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
});

const EURUSD: CurrencyPair = KNOWN_CURRENCY_PAIRS[0];
