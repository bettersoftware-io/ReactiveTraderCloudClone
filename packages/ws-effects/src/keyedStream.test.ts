import { of, Subject, throwError } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { keyedStream } from "#/keyedStream";
import { out } from "#/operators";
import type { Inbound, Outbound } from "#/types";

const SUB = "subscribe.pricing";
const UNSUB = "unsubscribe.pricing";

describe("keyedStream", () => {
  let scheduler: TestScheduler;
  beforeEach(() => {
    scheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it("coalesces repeated subscribes for the same key: a second subscribe does NOT start a second stream", () => {
    let projections = 0;
    const in$ = new Subject<Inbound>();
    const inner = new Subject<Outbound>();
    const effect = keyedStream<unknown>(SUB, UNSUB, keyOf, () => {
      projections += 1;
      return inner;
    });

    const outs: Outbound[] = [];
    effect(in$, undefined).subscribe((m: Outbound) => {
      return outs.push(m);
    });

    in$.next({ type: SUB, payload: { symbol: "EURUSD" } });
    in$.next({ type: SUB, payload: { symbol: "EURUSD" } });

    // One projected stream despite two subscribes → one tick reaches the client.
    inner.next(out("tick", "EURUSD"));

    expect(projections).toBe(1);
    expect(outs).toEqual([out("tick", "EURUSD")]);
  });

  it("tears the key's stream down only when the refcount returns to zero", () => {
    const in$ = new Subject<Inbound>();
    const inner = new Subject<Outbound>();
    const effect = keyedStream<unknown>(SUB, UNSUB, keyOf, () => {
      return inner;
    });

    const outs: Outbound[] = [];
    effect(in$, undefined).subscribe((m: Outbound) => {
      return outs.push(m);
    });

    in$.next({ type: SUB, payload: { symbol: "EURUSD" } }); // count 1
    in$.next({ type: SUB, payload: { symbol: "EURUSD" } }); // count 2
    in$.next({ type: UNSUB, payload: { symbol: "EURUSD" } }); // count 1 — still live

    inner.next(out("tick", "a"));
    expect(inner.observed).toBe(true); // still subscribed at count 1
    expect(outs).toEqual([out("tick", "a")]);

    in$.next({ type: UNSUB, payload: { symbol: "EURUSD" } }); // count 0 — torn down
    expect(inner.observed).toBe(false);

    // Emissions after teardown never reach the client.
    inner.next(out("tick", "b"));
    expect(outs).toEqual([out("tick", "a")]);
  });

  it("restarts a key's stream when it is re-subscribed after teardown", () => {
    let projections = 0;
    const in$ = new Subject<Inbound>();
    const effect = keyedStream<unknown>(SUB, UNSUB, keyOf, () => {
      projections += 1;
      return of(out("tick", `run-${projections}`));
    });

    const outs: Outbound[] = [];
    effect(in$, undefined).subscribe((m: Outbound) => {
      return outs.push(m);
    });

    in$.next({ type: SUB, payload: { symbol: "EURUSD" } }); // start run 1
    in$.next({ type: UNSUB, payload: { symbol: "EURUSD" } }); // teardown
    in$.next({ type: SUB, payload: { symbol: "EURUSD" } }); // start run 2

    expect(projections).toBe(2);
    expect(outs).toEqual([out("tick", "run-1"), out("tick", "run-2")]);
  });

  it("keeps distinct keys independent (a second symbol streams concurrently)", () => {
    scheduler.run(({ cold, hot, expectObservable }) => {
      const effect = keyedStream<unknown>(SUB, UNSUB, keyOf, (payload) => {
        return cold("x--x|", { x: out("tick", keyOf(payload)) });
      });

      const in$ = hot("ab", {
        a: { type: SUB, payload: { symbol: "A" } } as Inbound,
        b: { type: SUB, payload: { symbol: "B" } } as Inbound,
      });
      expectObservable(effect(in$, undefined)).toBe("ab-ab", {
        a: out("tick", "A") as Outbound,
        b: out("tick", "B") as Outbound,
      });
    });
  });

  it("isolates an erroring inner: a re-subscribe of the same key still streams", () => {
    let calls = 0;
    const in$ = new Subject<Inbound>();
    const effect = keyedStream<unknown>(SUB, UNSUB, keyOf, () => {
      calls += 1;
      return calls === 1
        ? throwError(() => {
            return new Error("boom");
          })
        : of(out("tick", "second"));
    });

    const outs: Outbound[] = [];
    let errored = false;
    effect(in$, undefined).subscribe({
      next: (m: Outbound) => {
        outs.push(m);
      },
      error: () => {
        errored = true;
      },
    });

    in$.next({ type: SUB, payload: { symbol: "EURUSD" } }); // errors, isolated
    in$.next({ type: UNSUB, payload: { symbol: "EURUSD" } });
    in$.next({ type: SUB, payload: { symbol: "EURUSD" } }); // clean run

    expect(errored).toBe(false);
    expect(outs).toEqual([out("tick", "second")]);
  });

  it("ignores inbound frames that are neither the sub nor unsub type", () => {
    scheduler.run(({ cold, hot, expectObservable }) => {
      const effect = keyedStream<unknown>(SUB, UNSUB, keyOf, () => {
        return cold("x|", { x: out("tick", 1) });
      });

      const in$ = hot("b|", {
        b: { type: "subscribe.other", payload: { symbol: "A" } } as Inbound,
      });
      expectObservable(effect(in$, undefined)).toBe("-|");
    });
  });
});

interface KeyPayload {
  readonly symbol: string;
}

function keyOf(payload: unknown): string {
  return (payload as KeyPayload).symbol;
}
