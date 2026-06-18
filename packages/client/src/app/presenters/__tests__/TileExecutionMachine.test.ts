import { describe, it, expect } from "vitest";
import { TestScheduler } from "rxjs/testing";
import { type Observable } from "rxjs";
import {
  Direction,
  ExecutionStatus,
  TradeStatus,
  TOO_LONG_THRESHOLD_MS,
  EXECUTION_TIMEOUT_MS,
  CONFIRMATION_DISMISS_MS,
  KNOWN_CURRENCY_PAIRS,
  PriceMovementType,
  type CurrencyPair,
  type Price,
  type Trade,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
} from "@rtc/domain";
import {
  createTileExecutionMachine,
  type TileExecutionState,
} from "../TileExecutionMachine";

const pair: CurrencyPair = KNOWN_CURRENCY_PAIRS.find((p) => p.symbol === "EURUSD")!;

const price: Price = {
  symbol: "EURUSD",
  bid: 1.0921,
  ask: 1.0925,
  mid: 1.0923,
  valueDate: "2026-06-15",
  creationTimestamp: 1,
  movementType: PriceMovementType.NONE,
  spread: "4.0",
};

const trade: Trade = {
  tradeId: 1,
  tradeName: "t",
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.0925,
  status: TradeStatus.Done,
  tradeDate: "2026-06-13",
  valueDate: "2026-06-15",
};

const doneResult: ExecuteTradeResult = { status: ExecutionStatus.Done, trade };

const READY: TileExecutionState = { status: "ready" };
const STARTED: TileExecutionState = { status: "started" };
const TOO_LONG: TileExecutionState = { status: "tooLong" };
const TIMEOUT: TileExecutionState = { status: "timeout" };

function scheduler() {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

/** Collect every emission of a machine's state$ as it runs, marble-driven. */
function run(
  buildExecute: (ts: TestScheduler) => (input: ExecuteTradeInput) => Observable<ExecuteTradeResult>,
  drive: (ctx: {
    machine: ReturnType<typeof createTileExecutionMachine>;
    ts: TestScheduler;
  }) => void,
): TileExecutionState[] {
  const states: TileExecutionState[] = [];
  const ts = scheduler();
  ts.run(({ flush }) => {
    const machine = createTileExecutionMachine(pair, { execute: buildExecute(ts) });
    const sub = machine.state$.subscribe((s) => states.push(s));
    drive({ machine, ts });
    flush();
    sub.unsubscribe();
    machine.dispose();
  });
  return states;
}

describe("createTileExecutionMachine", () => {
  it("starts in the ready state (synchronous default)", () => {
    const ts = scheduler();
    ts.run(() => {
      const machine = createTileExecutionMachine(pair, { execute: () => never(ts) });
      let current: TileExecutionState | undefined;
      const sub = machine.state$.subscribe((s) => (current = s));
      expect(current).toEqual(READY);
      sub.unsubscribe();
      machine.dispose();
    });
  });

  it("execute() → started, then finished with the result status and trade", () => {
    const states = run(
      (ts) => () => ts.createColdObservable<ExecuteTradeResult>("10ms (a|)", { a: doneResult }),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.execute(Direction.Buy, price, 1_000_000), 1);
      },
    );
    expect(states).toEqual([
      READY,
      STARTED,
      { status: "finished", executionStatus: ExecutionStatus.Done, trade },
      READY,
    ]);
  });

  it("a rejected execute result lands as finished{Rejected}, then dismisses", () => {
    const rejected: ExecuteTradeResult = {
      status: ExecutionStatus.Rejected,
      trade: { ...trade, status: TradeStatus.Rejected },
    };
    const states = run(
      (ts) => () => ts.createColdObservable<ExecuteTradeResult>("10ms (a|)", { a: rejected }),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.execute(Direction.Sell, price, 500_000), 1);
      },
    );
    expect(states.map((s) => s.status)).toEqual([
      "ready",
      "started",
      "finished",
      "ready",
    ]);
    expect(states[2]).toMatchObject({ executionStatus: ExecutionStatus.Rejected });
  });

  it("execute() that errors → finished{Timeout} (not the timeout state)", () => {
    const states = run(
      (ts) => () => ts.createColdObservable<ExecuteTradeResult>("10ms #", {}, new Error("boom")),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.execute(Direction.Buy, price, 1_000_000), 1);
      },
    );
    expect(states).toEqual([
      READY,
      STARTED,
      { status: "finished", executionStatus: ExecutionStatus.Timeout },
      READY,
    ]);
  });

  it("escalates to tooLong after TOO_LONG_THRESHOLD_MS while still started", () => {
    const states = run(
      (ts) => () => never(ts),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.execute(Direction.Buy, price, 1_000_000), 1);
        // stop observing before the 30s timeout so we only see started→tooLong
        ts.schedule(() => {}, TOO_LONG_THRESHOLD_MS + 5);
      },
    );
    // ready, started, tooLong (timeout will follow much later, beyond our window
    // is fine — we only assert the leading prefix here)
    expect(states.slice(0, 3)).toEqual([READY, STARTED, TOO_LONG]);
  });

  it("escalates to timeout after EXECUTION_TIMEOUT_MS, then auto-dismisses to ready", () => {
    const states = run(
      (ts) => () => never(ts),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.execute(Direction.Buy, price, 1_000_000), 1);
      },
    );
    expect(states).toEqual([READY, STARTED, TOO_LONG, TIMEOUT, READY]);
  });

  it("drops a command result that lands after the 30s timeout", () => {
    const states = run(
      // result arrives 5ms AFTER the execution timeout — must be ignored.
      (ts) => () =>
        ts.createColdObservable<ExecuteTradeResult>(
          `${EXECUTION_TIMEOUT_MS + 5}ms (a|)`,
          { a: doneResult },
        ),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.execute(Direction.Buy, price, 1_000_000), 1);
      },
    );
    // never reaches "finished"; stays timeout then dismisses to ready.
    expect(states).toEqual([READY, STARTED, TOO_LONG, TIMEOUT, READY]);
  });

  it("does not flip to tooLong once a terminal state has been reached", () => {
    // Result resolves at 5ms, well before the 2000ms tooLong threshold.
    const states = run(
      (ts) => () => ts.createColdObservable<ExecuteTradeResult>("5ms (a|)", { a: doneResult }),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.execute(Direction.Buy, price, 1_000_000), 1);
      },
    );
    expect(states.some((s) => s.status === "tooLong")).toBe(false);
    expect(states).toEqual([
      READY,
      STARTED,
      { status: "finished", executionStatus: ExecutionStatus.Done, trade },
      READY,
    ]);
  });

  it("dismiss() returns to ready immediately and cancels pending escalation", () => {
    const states = run(
      (ts) => () => never(ts),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.execute(Direction.Buy, price, 1_000_000), 1);
        ts.schedule(() => machine.intents.dismiss(), 100);
      },
    );
    expect(states).toEqual([READY, STARTED, READY]);
  });

  it("supports a fresh run after a dismiss (takeUntil only tears down the active run)", () => {
    const states = run(
      (ts) => () => ts.createColdObservable<ExecuteTradeResult>("10ms (a|)", { a: doneResult }),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.execute(Direction.Buy, price, 1_000_000), 1);
        ts.schedule(() => machine.intents.dismiss(), 5);
        ts.schedule(() => machine.intents.execute(Direction.Sell, price, 500_000), 7);
      },
    );
    // 1st: ready→started→ready(dismiss). 2nd: started→finished→ready.
    expect(states).toEqual([
      READY,
      STARTED,
      READY,
      STARTED,
      { status: "finished", executionStatus: ExecutionStatus.Done, trade },
      READY,
    ]);
  });

  it("finishing cancels the tooLong/timeout escalation", () => {
    const states = run(
      (ts) => () => ts.createColdObservable<ExecuteTradeResult>("10ms (a|)", { a: doneResult }),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.execute(Direction.Buy, price, 1_000_000), 1);
      },
    );
    expect(states.some((s) => s.status === "tooLong")).toBe(false);
    expect(states.some((s) => s.status === "timeout")).toBe(false);
  });

  it("dispose() tears the machine down: source Subjects complete and intents become no-ops", () => {
    // react-rxjs `state()` deliberately does NOT forward source-completion to
    // subscribers (it keeps the latest value as a hot snapshot, completing only
    // when refCount hits 0 on the consumer's unmount). So the verifiable
    // teardown contract is that dispose() completes the internal Subjects and
    // releases the warm subscription — after which firing an intent emits
    // nothing further on state$.
    const ts = scheduler();
    ts.run(({ flush }) => {
      const machine = createTileExecutionMachine(pair, { execute: () => never(ts) });
      const seen: TileExecutionState[] = [];
      const sub = machine.state$.subscribe((s) => seen.push(s));
      machine.dispose();
      // Intents after dispose must be inert (Subjects are completed/closed).
      machine.intents.execute(Direction.Buy, price, 1_000_000);
      machine.intents.dismiss();
      flush();
      sub.unsubscribe();
      expect(seen).toEqual([READY]);
    });
  });
});

/** A cold observable that never emits/completes within the test window. */
function never(ts: TestScheduler): Observable<ExecuteTradeResult> {
  return ts.createColdObservable<ExecuteTradeResult>("-");
}
