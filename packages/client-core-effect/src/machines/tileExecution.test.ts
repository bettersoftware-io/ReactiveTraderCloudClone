import { Observable, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Stream, TileExecutionState } from "@rtc/core-api";
import {
  CONFIRMATION_DISMISS_MS,
  type CurrencyPair,
  Direction,
  EXECUTION_TIMEOUT_MS,
  type ExecuteTradeInput,
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

describe("createTileExecutionMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ready → started → finished{Done} → ready after CONFIRMATION_DISMISS_MS", async () => {
    const commands = createCommands();
    const m = createTileExecutionMachine(EURUSD, commands.deps);
    const seen = collect(m.state$);
    expect(seen).toEqual([{ status: "ready" }]);
    m.intents.execute(Direction.Buy, PRICE, 1_000_000);
    await settle();
    expect(statuses(seen)).toEqual(["ready", "started"]);
    expect(commands.pendingCount()).toBe(1);
    const trade = createTrade(TradeStatus.Done);
    commands.resolve(trade);
    await settle();
    expect(seen.at(-1)).toEqual({
      status: "finished",
      executionStatus: ExecutionStatus.Done,
      trade,
    });
    await vi.advanceTimersByTimeAsync(CONFIRMATION_DISMISS_MS);
    await settle();
    expect(statuses(seen)).toEqual(["ready", "started", "finished", "ready"]);
    m.dispose();
  });

  it("escalates to tooLong then timeout, and a late result is dropped", async () => {
    const commands = createCommands();
    const m = createTileExecutionMachine(EURUSD, commands.deps);
    const seen = collect(m.state$);
    m.intents.execute(Direction.Buy, PRICE, 1);
    await settle();
    await vi.advanceTimersByTimeAsync(TOO_LONG_THRESHOLD_MS);
    await settle();
    expect(seen.at(-1)?.status).toBe("tooLong");
    await vi.advanceTimersByTimeAsync(
      EXECUTION_TIMEOUT_MS - TOO_LONG_THRESHOLD_MS,
    );
    await settle();
    expect(seen.at(-1)?.status).toBe("timeout");
    // `Effect.race` interrupts the losing `rpc` fiber the instant the
    // timeout wins, so the harness's fake execute port has NOTHING pending
    // — released at once by `Effect.race` (contrast the async core's
    // twin, which holds it until dismiss/new execute/dispose) — recorded in
    // ADR-006, "Decided in slice 2" (cross-core asymmetries).
    expect(commands.pendingCount()).toBe(0);
    commands.resolve(createTrade(TradeStatus.Done));
    await settle();
    expect(seen.at(-1)?.status).toBe("timeout");
    m.dispose();
  });

  it("a failing command is finished{Timeout}, never the timeout state", async () => {
    const commands = createCommands();
    const m = createTileExecutionMachine(EURUSD, commands.deps);
    const seen = collect(m.state$);
    m.intents.execute(Direction.Buy, PRICE, 1);
    await settle();
    commands.fail(new Error("bust"));
    await settle();
    expect(seen.at(-1)).toEqual({
      status: "finished",
      executionStatus: ExecutionStatus.Timeout,
    });
    m.dispose();
  });

  it("finishing cancels the escalation, and dismiss() cancels every pending timer", async () => {
    const commands = createCommands();
    const m = createTileExecutionMachine(EURUSD, commands.deps);
    const seen = collect(m.state$);
    m.intents.execute(Direction.Buy, PRICE, 1);
    await settle();
    commands.resolve(createTrade(TradeStatus.Done));
    await settle();
    await vi.advanceTimersByTimeAsync(TOO_LONG_THRESHOLD_MS);
    await settle();
    expect(statuses(seen)).toEqual(["ready", "started", "finished"]);
    m.intents.dismiss();
    await settle();
    await vi.advanceTimersByTimeAsync(
      EXECUTION_TIMEOUT_MS + CONFIRMATION_DISMISS_MS,
    );
    await settle();
    expect(statuses(seen)).toEqual(["ready", "started", "finished", "ready"]);
    m.dispose();
  });

  it("a new execute() supersedes the in-flight run: the first request is withdrawn", async () => {
    const commands = createCommands();
    const m = createTileExecutionMachine(EURUSD, commands.deps);
    const seen = collect(m.state$);
    m.intents.execute(Direction.Buy, PRICE, 1);
    await settle();
    m.intents.execute(Direction.Buy, PRICE, 2);
    await settle();
    expect(commands.notionals()).toEqual([2]);
    const trade = createTrade(TradeStatus.Done);
    commands.resolve(trade);
    await settle();
    expect(seen.at(-1)).toEqual({
      status: "finished",
      executionStatus: ExecutionStatus.Done,
      trade,
    });
    m.dispose();
  });

  it("dispose() makes the intents inert: no request is ever subscribed, and a fresh subscription yields ready synchronously", async () => {
    const commands = createCommands();
    const m = createTileExecutionMachine(EURUSD, commands.deps);
    m.dispose();
    m.intents.execute(Direction.Buy, PRICE, 1);
    await settle();
    expect(commands.pendingCount()).toBe(0);
    expect(collect(m.state$)).toEqual([{ status: "ready" }]);
  });

  it("dismiss() after dispose() is inert too", async () => {
    const commands = createCommands();
    const m = createTileExecutionMachine(EURUSD, commands.deps);
    m.intents.execute(Direction.Buy, PRICE, 1);
    await settle();
    m.dispose();
    m.intents.dismiss();
    await settle();
    // The state the run left behind is untouched by a post-dispose intent.
    expect(collect(m.state$)).toEqual([{ status: "started" }]);
  });
});

interface PendingCommand {
  input: ExecuteTradeInput;
  result: Subject<ExecuteTradeResult>;
}

interface TestCommands {
  deps: {
    execute: (input: ExecuteTradeInput) => Observable<ExecuteTradeResult>;
  };
  pendingCount: () => number;
  notionals: () => number[];
  resolve: (trade: Trade) => void;
  fail: (error: unknown) => void;
}

function createCommands(): TestCommands {
  const pending: PendingCommand[] = [];

  function settlePending(
    apply: (result: Subject<ExecuteTradeResult>) => void,
  ): void {
    const oldest = pending.shift();

    if (oldest !== undefined) {
      apply(oldest.result);
    }
  }

  return {
    deps: {
      execute: (input: ExecuteTradeInput) => {
        return new Observable<ExecuteTradeResult>((subscriber) => {
          const entry: PendingCommand = {
            input,
            result: new Subject<ExecuteTradeResult>(),
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
    pendingCount: () => {
      return pending.length;
    },
    notionals: () => {
      return pending.map((entry) => {
        return entry.input.notional;
      });
    },
    resolve: (trade: Trade) => {
      settlePending((result) => {
        result.next({ trade, status: ExecutionStatus.Done });
        result.complete();
      });
    },
    fail: (error: unknown) => {
      settlePending((result) => {
        result.error(error);
      });
    },
  };
}

function statuses(values: readonly TileExecutionState[]): string[] {
  return values.map((state) => {
    return state.status;
  });
}

function collect(stream: Stream<TileExecutionState>): TileExecutionState[] {
  const values: TileExecutionState[] = [];
  stream.subscribe((value: TileExecutionState) => {
    values.push(value);
  });
  return values;
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
    tradeId: 9,
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

/** Two zero-length advances: no time moves, the microtask continuations an
 * Effect fiber resumes on do. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

const EURUSD = findPair("EURUSD");

const PRICE = createPrice(1.1);
