import { Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Stream } from "@rtc/core-api";
import { ConnectionStatus } from "@rtc/domain";

import { createStaleFlagMachine } from "#/machines/staleFlag";

describe("createStaleFlagMachine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts false synchronously, goes stale on a reconnect and clears on the next value", async () => {
    const status$ = new Subject<ConnectionStatus>();
    const value$ = new Subject<number>();
    const m = createStaleFlagMachine({ status$, value$ });
    const seen = collect(m.state$);
    expect(seen).toEqual([false]);
    status$.next(ConnectionStatus.DISCONNECTED);
    await tick();
    status$.next(ConnectionStatus.CONNECTED);
    await tick();
    expect(seen).toEqual([false, true]);
    value$.next(1);
    await tick();
    expect(seen).toEqual([false, true, false]);
    // Distinct consecutive states only: more values do not re-emit `false`.
    value$.next(2);
    value$.next(3);
    await tick();
    expect(seen).toEqual([false, true, false]);
    m.dispose();
  });

  it("both ports are subscribed from creation and released by dispose()", async () => {
    const status$ = new Subject<ConnectionStatus>();
    const value$ = new Subject<number>();
    const m = createStaleFlagMachine({ status$, value$ });
    expect(status$.observed).toBe(true);
    expect(value$.observed).toBe(true);
    m.dispose();
    await tick();
    expect(status$.observed).toBe(false);
    expect(value$.observed).toBe(false);
  });

  it("dispose() makes the machine inert; a fresh subscription then yields the current value synchronously", async () => {
    const status$ = new Subject<ConnectionStatus>();
    const value$ = new Subject<number>();
    const m = createStaleFlagMachine({ status$, value$ });
    const seen = collect(m.state$);
    status$.next(ConnectionStatus.DISCONNECTED);
    await tick();
    status$.next(ConnectionStatus.CONNECTED);
    await tick();
    expect(seen.at(-1)).toBe(true);
    m.dispose();
    await tick();
    expect(collect(m.state$)).toEqual([true]);
  });

  it("a failing source closes the machine's scope and rethrows the cause out of band", async () => {
    vi.useFakeTimers();
    const status$ = new Subject<ConnectionStatus>();
    const value$ = new Subject<number>();
    createStaleFlagMachine({ status$, value$ });
    value$.error(new Error("feed"));
    // MEASURED (vitest 4.1.11, effect 3.22.2): nothing is pending here —
    // the fold's fiber resumes on a MICROTASK inside the advance below, and
    // the zero-delay timer `reportOutOfBand` then schedules becomes
    // eligible within that SAME call, so the throw comes out of the advance
    // itself, not out of a later `runAllTimers()`.
    await expect(vi.advanceTimersByTimeAsync(0)).rejects.toThrow("feed");
    expect(status$.observed).toBe(false);
    expect(value$.observed).toBe(false);
  });
});

function collect(stream: Stream<boolean>): boolean[] {
  const values: boolean[] = [];
  stream.subscribe((value: boolean) => {
    values.push(value);
  });
  return values;
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
