import { ConnectionStatus } from "@rtc/domain";
import type { Observable } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { describe, expect, it } from "vitest";
import { createStaleFlagMachine } from "../StaleFlagMachine";

function scheduler() {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

/** Build the machine over two marble streams and collect every flag emission. */
function run(
  statusMarble: string,
  statusValues: Record<string, ConnectionStatus>,
  valueMarble: string,
  valueValues: Record<string, unknown>,
): boolean[] {
  const flags: boolean[] = [];
  const ts = scheduler();
  ts.run(({ cold, flush }) => {
    const status$ = cold(
      statusMarble,
      statusValues,
    ) as Observable<ConnectionStatus>;
    const value$ = cold(valueMarble, valueValues) as Observable<unknown>;
    const machine = createStaleFlagMachine({ status$, value$ });
    const sub = machine.state$.subscribe((s) => flags.push(s));
    flush();
    sub.unsubscribe();
    machine.dispose();
  });
  return flags;
}

const C = ConnectionStatus.CONNECTED;
const D = ConnectionStatus.DISCONNECTED;
const I = ConnectionStatus.IDLE_DISCONNECTED;

describe("createStaleFlagMachine", () => {
  it("starts false (synchronous default)", () => {
    const ts = scheduler();
    ts.run(({ cold }) => {
      const status$ = cold("-", {}) as Observable<ConnectionStatus>;
      const value$ = cold("-", {}) as Observable<unknown>;
      const machine = createStaleFlagMachine({ status$, value$ });
      let current: boolean | undefined;
      const sub = machine.state$.subscribe((s) => (current = s));
      expect(current).toBe(false);
      sub.unsubscribe();
      machine.dispose();
    });
  });

  it("stays false while connected throughout, even as values change", () => {
    // status connected the whole time; values arrive but no disconnect ever
    // latched, so the flag is never stale (distinctUntilChanged → single false).
    const flags = run("c---------", { c: C }, "a--b--c---", {
      a: { v: 1 },
      b: { v: 2 },
      c: { v: 3 },
    });
    expect(flags).toEqual([false]);
  });

  it("becomes stale after disconnect → reconnect with no new value", () => {
    // a connected, then disconnect, then reconnect; the value reference never
    // changes after reconnect → stale.
    const v = { v: 1 };
    const flags = run("c--d--c---", { c: C, d: D }, "a---------", { a: v });
    expect(flags).toEqual([false, true]);
  });

  it("clears when a new value reference arrives after reconnect", () => {
    const first = { v: 1 };
    const second = { v: 2 };
    const flags = run("c--d--c------", { c: C, d: D }, "a--------b---", {
      a: first,
      b: second,
    });
    // false (init/connected) → true (reconnect, same ref) → false (new ref).
    expect(flags).toEqual([false, true, false]);
  });

  it("stays stale while the same value reference persists after reconnect", () => {
    const v = { v: 1 };
    // The same reference is re-emitted after reconnect; reference equality means
    // it is NOT new data → stays stale (no flip back to false).
    const flags = run("c--d--c------", { c: C, d: D }, "a--------a---", {
      a: v,
    });
    expect(flags).toEqual([false, true]);
  });

  it("handles multiple disconnect/reconnect cycles", () => {
    const first = { v: 1 };
    const second = { v: 2 };
    // cycle 1: disconnect→reconnect (stale) → new value (clears)
    // cycle 2: disconnect→reconnect again (stale)
    const flags = run(
      "c--d--c-----d--c----",
      { c: C, d: D },
      "a--------b----------",
      { a: first, b: second },
    );
    expect(flags).toEqual([false, true, false, true]);
  });

  it("treats an idle disconnect as a connection loss", () => {
    const v = { v: 1 };
    const flags = run("c--i--c---", { c: C, i: I }, "a---------", { a: v });
    expect(flags).toEqual([false, true]);
  });

  it("dispose() + unsubscribe tears the machine down (no further emissions)", () => {
    const ts = scheduler();
    ts.run(({ cold, flush }) => {
      const status$ = cold("c--d--c", {
        c: C,
        d: D,
      }) as Observable<ConnectionStatus>;
      const value$ = cold("a", { a: { v: 1 } }) as Observable<unknown>;
      const machine = createStaleFlagMachine({ status$, value$ });
      const seen: boolean[] = [];
      const sub = machine.state$.subscribe((s) => seen.push(s));
      // Mirror unmount: useMachine unsubscribes from state$ and dispose()
      // releases the warm subscription; with no subscribers the refCounted
      // stream tears down and the (not-yet-played) disconnect/reconnect never
      // reaches the scan.
      sub.unsubscribe();
      machine.dispose();
      flush();
      // Only the synchronous default was observed before teardown.
      expect(seen).toEqual([false]);
    });
  });
});
