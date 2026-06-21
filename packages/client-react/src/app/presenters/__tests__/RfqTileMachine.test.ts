import {
  type CurrencyPair,
  KNOWN_CURRENCY_PAIRS,
  REJECTED_DISPLAY_MS,
  RFQ_TIMEOUT_MS,
  type RfqQuoteResult,
} from "@rtc/domain";
import type { Observable } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it } from "vitest";
import { createRfqTileMachine, type RfqState } from "../RfqTileMachine";

const pair: CurrencyPair = KNOWN_CURRENCY_PAIRS.find(
  (p) => p.symbol === "EURUSD",
)!;

const quoteResult: RfqQuoteResult = { bid: 1.0921, ask: 1.0925, mid: 1.0923 };

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };
const REQUESTED: RfqState = {
  status: "requested",
  quote: null,
  remainingMs: 0,
};
const REJECTED: RfqState = { status: "rejected", quote: null, remainingMs: 0 };

function received(remainingMs: number): RfqState {
  return {
    status: "received",
    quote: {
      bid: quoteResult.bid,
      ask: quoteResult.ask,
      timeoutMs: RFQ_TIMEOUT_MS,
    },
    remainingMs,
  };
}

function scheduler() {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

/** Collect every emission of a machine's state$ as it runs, marble-driven. */
function run(
  buildRequestQuote: (
    ts: TestScheduler,
  ) => (symbol: string, pipsPosition: number) => Observable<RfqQuoteResult>,
  drive: (ctx: {
    machine: ReturnType<typeof createRfqTileMachine>;
    ts: TestScheduler;
  }) => void,
): RfqState[] {
  const states: RfqState[] = [];
  const ts = scheduler();
  ts.run(({ flush }) => {
    const machine = createRfqTileMachine(pair, {
      requestQuote: buildRequestQuote(ts),
    });
    const sub = machine.state$.subscribe((s) => states.push(s));
    drive({ machine, ts });
    flush();
    sub.unsubscribe();
    machine.dispose();
  });
  return states;
}

/** A request-quote command that never resolves within the test window. */
function never(ts: TestScheduler): Observable<RfqQuoteResult> {
  return ts.createColdObservable<RfqQuoteResult>("-");
}

describe("createRfqTileMachine", () => {
  it("starts in the init state (synchronous default)", () => {
    const ts = scheduler();
    ts.run(() => {
      const machine = createRfqTileMachine(pair, {
        requestQuote: () => never(ts),
      });
      let current: RfqState | undefined;
      const sub = machine.state$.subscribe((s) => (current = s));
      expect(current).toEqual(INIT);
      sub.unsubscribe();
      machine.dispose();
    });
  });

  it("requestQuote() is a no-op unless in the init state", () => {
    const states = run(
      (ts) => () => never(ts),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.requestQuote(), 1);
        // A second requestQuote while already requested is ignored.
        ts.schedule(() => machine.intents.requestQuote(), 3);
      },
    );
    expect(states).toEqual([INIT, REQUESTED]);
  });

  it("requestQuote() requests for the pair's symbol and pipsPosition", () => {
    const calls: { symbol: string; pipsPosition: number }[] = [];
    run(
      (ts) => (symbol, pipsPosition) => {
        calls.push({ symbol, pipsPosition });
        return never(ts);
      },
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.requestQuote(), 1);
      },
    );
    expect(calls).toEqual([
      { symbol: pair.symbol, pipsPosition: pair.pipsPosition },
    ]);
  });

  it("requested → received when the quote resolves", () => {
    const states = run(
      (ts) => () =>
        ts.createColdObservable<RfqQuoteResult>("10ms (a|)", {
          a: quoteResult,
        }),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.requestQuote(), 1);
        // Stop observing just after the quote arrives so we only see the first tick.
        ts.schedule(() => {}, 12);
      },
    );
    expect(states.slice(0, 3)).toEqual([
      INIT,
      REQUESTED,
      received(RFQ_TIMEOUT_MS),
    ]);
  });

  it("requested → rejected when the quote request errors, then holds then init", () => {
    const states = run(
      (ts) => () =>
        ts.createColdObservable<RfqQuoteResult>(
          "10ms #",
          {},
          new Error("no quote"),
        ),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.requestQuote(), 1);
      },
    );
    expect(states).toEqual([INIT, REQUESTED, REJECTED, INIT]);
  });

  it("decrements remainingMs every COUNTDOWN_INTERVAL_MS while received", () => {
    const states = run(
      (ts) => () =>
        ts.createColdObservable<RfqQuoteResult>("(a|)", { a: quoteResult }),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.requestQuote(), 1);
      },
    );
    // INIT, REQUESTED, then received at remaining 10000, 9900, 9800, 9700
    // (t=1,101,201,301), decrementing by COUNTDOWN_INTERVAL_MS each tick.
    expect(states.slice(0, 6)).toEqual([
      INIT,
      REQUESTED,
      received(10_000),
      received(9_900),
      received(9_800),
      received(9_700),
    ]);
  });

  it("auto-rejects when the countdown reaches zero, then returns to init", () => {
    const states = run(
      (ts) => () =>
        ts.createColdObservable<RfqQuoteResult>("(a|)", { a: quoteResult }),
      ({ machine, ts }) => {
        ts.schedule(() => machine.intents.requestQuote(), 1);
      },
    );
    // Last received tick is at remaining 100 (t=9900); at t=10000 → rejected; +2000 → init.
    expect(states[states.length - 3]).toEqual(received(100));
    expect(states[states.length - 2]).toEqual(REJECTED);
    expect(states[states.length - 1]).toEqual(INIT);
    expect(
      states.some((s) => s.status === "received" && s.remainingMs <= 0),
    ).toBe(false);
  });

  it("rejected holds for REJECTED_DISPLAY_MS before returning to init", () => {
    // Record the scheduler frame of each emission to pin the hold duration: the
    // rejected→init transition must land exactly REJECTED_DISPLAY_MS after
    // rejected, not sooner.
    const ts = scheduler();
    const seen: { frame: number; state: RfqState }[] = [];
    ts.run(({ flush }) => {
      const machine = createRfqTileMachine(pair, {
        requestQuote: () =>
          ts.createColdObservable<RfqQuoteResult>("10ms #", {}, new Error("x")),
      });
      const sub = machine.state$.subscribe((state) =>
        seen.push({ frame: ts.now(), state }),
      );
      ts.schedule(() => machine.intents.requestQuote(), 1);
      flush();
      sub.unsubscribe();
      machine.dispose();
    });
    expect(seen.map((e) => e.state)).toEqual([INIT, REQUESTED, REJECTED, INIT]);
    const rejectedFrame = seen.find(
      (e) => e.state.status === "rejected",
    )!.frame;
    const initAfterHold = seen[seen.length - 1];
    expect(initAfterHold.state).toEqual(INIT);
    expect(initAfterHold.frame - rejectedFrame).toBe(REJECTED_DISPLAY_MS);
  });

  it("cancel() returns to init only from the requested state", () => {
    const states = run(
      (ts) => () => never(ts),
      ({ machine, ts }) => {
        // cancel from init: no-op.
        ts.schedule(() => machine.intents.cancel(), 1);
        ts.schedule(() => machine.intents.requestQuote(), 2);
        ts.schedule(() => machine.intents.cancel(), 3);
        // cancel again from init: no-op.
        ts.schedule(() => machine.intents.cancel(), 4);
      },
    );
    expect(states).toEqual([INIT, REQUESTED, INIT]);
  });

  it("reject() moves to rejected only from the received state", () => {
    const states = run(
      (ts) => () =>
        ts.createColdObservable<RfqQuoteResult>("5ms (a|)", { a: quoteResult }),
      ({ machine, ts }) => {
        // reject from init: no-op.
        ts.schedule(() => machine.intents.reject(), 1);
        ts.schedule(() => machine.intents.requestQuote(), 2);
        // reject from received → rejected, then holds REJECTED_DISPLAY_MS → init.
        ts.schedule(() => machine.intents.reject(), 10);
      },
    );
    expect(states).toEqual([
      INIT,
      REQUESTED,
      received(RFQ_TIMEOUT_MS),
      REJECTED,
      INIT,
    ]);
  });

  it("accept() returns to init only from the received state (no synchronous return)", () => {
    const states = run(
      (ts) => () =>
        ts.createColdObservable<RfqQuoteResult>("5ms (a|)", { a: quoteResult }),
      ({ machine, ts }) => {
        // accept from init: no-op.
        ts.schedule(() => machine.intents.accept(), 1);
        ts.schedule(() => machine.intents.requestQuote(), 2);
        ts.schedule(() => machine.intents.accept(), 10);
      },
    );
    expect(states).toEqual([INIT, REQUESTED, received(RFQ_TIMEOUT_MS), INIT]);
  });

  it("accept() yields no value (void) — the quote is not returned synchronously", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const machine = createRfqTileMachine(pair, {
        requestQuote: () =>
          ts.createColdObservable<RfqQuoteResult>("5ms (a|)", {
            a: quoteResult,
          }),
      });
      const sub = machine.state$.subscribe();
      let returned: unknown = "sentinel";
      ts.schedule(() => machine.intents.requestQuote(), 2);
      ts.schedule(() => {
        returned = (machine.intents.accept as () => unknown)();
      }, 10);
      flush();
      sub.unsubscribe();
      machine.dispose();
      expect(returned).toBeUndefined();
    });
  });

  it("dispose() tears the machine down: intents become no-ops afterwards", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const machine = createRfqTileMachine(pair, {
        requestQuote: () => never(ts),
      });
      const seen: RfqState[] = [];
      const sub = machine.state$.subscribe((s) => seen.push(s));
      machine.dispose();
      machine.intents.requestQuote();
      machine.intents.cancel();
      machine.intents.reject();
      machine.intents.accept();
      flush();
      sub.unsubscribe();
      expect(seen).toEqual([INIT]);
    });
  });
});
