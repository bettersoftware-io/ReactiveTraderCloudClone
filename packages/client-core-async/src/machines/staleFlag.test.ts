import { Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionStatus } from "@rtc/domain";

import { createStaleFlagMachine } from "#/machines/staleFlag";

describe("createStaleFlagMachine (async)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("folds status and value through reduceStaleFlag and drops equal states", () => {
    const status = new Subject<ConnectionStatus>();
    const value = new Subject<Watched>();
    const m = createStaleFlagMachine<Watched>({
      status$: status,
      value$: value,
    });
    const seen: boolean[] = [];
    const sub = m.state$.subscribe((flag) => {
      seen.push(flag);
    });
    expect(seen).toEqual([false]);
    status.next(ConnectionStatus.CONNECTED);
    status.next(ConnectionStatus.DISCONNECTED);
    status.next(ConnectionStatus.CONNECTED);
    expect(seen).toEqual([false, true]);
    value.next({ mid: 1 });
    // Each further price is a new reference but the flag is already false:
    // the Store's Object.is drop is the distinctUntilChanged.
    value.next({ mid: 2 });
    value.next({ mid: 3 });
    expect(seen).toEqual([false, true, false]);
    sub.unsubscribe();
    m.dispose();
  });

  it("dispose() releases both sources", () => {
    const status = new Subject<ConnectionStatus>();
    const value = new Subject<Watched>();
    const m = createStaleFlagMachine<Watched>({
      status$: status,
      value$: value,
    });
    expect(status.observed).toBe(true);
    expect(value.observed).toBe(true);
    m.dispose();
    expect(status.observed).toBe(false);
    expect(value.observed).toBe(false);
  });

  it("a source failure aborts the machine and is rethrown on a macrotask", async () => {
    vi.useFakeTimers();
    const status = new Subject<ConnectionStatus>();
    const value = new Subject<Watched>();
    const m = createStaleFlagMachine<Watched>({
      status$: status,
      value$: value,
    });
    value.error(new Error("feed"));
    // The rejection travels Promise.all → the catch block → spawn's own
    // catch before `reportAsync` schedules the rethrow, so the microtask
    // queue has to drain before the macrotask exists to run.
    await flushMicrotasks();
    expect(() => {
      vi.runAllTimers();
    }).toThrow("feed");
    expect(status.observed).toBe(false);
    m.dispose();
  });

  async function flushMicrotasks(): Promise<void> {
    for (let turn = 0; turn < 8; turn += 1) {
      await Promise.resolve();
    }
  }
});

interface Watched {
  readonly mid: number;
}
