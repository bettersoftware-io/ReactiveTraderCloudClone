import { describe, it, expect } from "vitest";
import { TestScheduler } from "rxjs/testing";
import { type Observable } from "rxjs";
import type { AdminPort } from "@rtc/domain";
import {
  ThroughputPresenter,
  type ThroughputView,
} from "../ThroughputPresenter";

const DEBOUNCE_MS = 300;
const MESSAGE_DISMISS_MS = 3_000;

function scheduler() {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

/** Build a fake AdminPort whose get/set are marble-driven cold observables. */
function fakeAdmin(
  ts: TestScheduler,
  opts: {
    /** Marble for getThroughput() (single value then complete, or error). */
    get: { marble: string; values?: Record<string, number>; error?: unknown };
    /** Factory for setThroughput()'s observable, given the value written. */
    set?: (value: number) => Observable<void>;
  },
): { port: AdminPort; sets: number[] } {
  const sets: number[] = [];
  const port: AdminPort = {
    getThroughput: () =>
      ts.createColdObservable<number>(
        opts.get.marble,
        opts.get.values,
        opts.get.error,
      ),
    setThroughput: (value: number) => {
      sets.push(value);
      return opts.set
        ? opts.set(value)
        : ts.createColdObservable<void>("(a|)", { a: undefined });
    },
  };
  return { port, sets };
}

/**
 * Run a presenter under the TestScheduler, collecting every state$ emission.
 * `drive` schedules intents on the virtual timeline.
 */
function run(
  buildPort: (ts: TestScheduler) => { port: AdminPort; sets: number[] },
  drive?: (ctx: { presenter: ThroughputPresenter; ts: TestScheduler }) => void,
): { states: ThroughputView[]; sets: number[] } {
  const states: ThroughputView[] = [];
  const ts = scheduler();
  let sets: number[] = [];
  ts.run(({ flush }) => {
    const built = buildPort(ts);
    sets = built.sets;
    const presenter = new ThroughputPresenter(built.port);
    const sub = presenter.state$.subscribe((s) => states.push(s));
    drive?.({ presenter, ts });
    flush();
    sub.unsubscribe();
  });
  return { states, sets };
}

describe("ThroughputPresenter", () => {
  it("seeds loading:true synchronously, then the loaded value", () => {
    const { states } = run((ts) =>
      fakeAdmin(ts, { get: { marble: "10ms (a|)", values: { a: 250 } } }),
    );
    expect(states).toEqual([
      { value: 100, loading: true, message: null },
      { value: 250, loading: false, message: null },
    ]);
  });

  it("reflects setValue optimistically before the write resolves", () => {
    const { states } = run(
      (ts) => fakeAdmin(ts, { get: { marble: "(a|)", values: { a: 100 } } }),
      ({ presenter, ts }) => {
        // Fire setValue just after load; observe the optimistic value lands
        // before the debounce window (300ms) elapses.
        ts.schedule(() => presenter.setValue(420), 1);
        ts.schedule(() => {}, 100); // stop the window before debounce fires
      },
    );
    // last observed value within the first 100ms is the optimistic 420
    const valuesSeen = states.map((s) => s.value);
    expect(valuesSeen).toContain(420);
    // no message yet (write hasn't fired)
    expect(states[states.length - 1].message).toBeNull();
  });

  it("coalesces rapid setValue into a single debounced write", () => {
    const { states, sets } = run(
      (ts) => fakeAdmin(ts, { get: { marble: "(a|)", values: { a: 100 } } }),
      ({ presenter, ts }) => {
        ts.schedule(() => presenter.setValue(200), 1);
        ts.schedule(() => presenter.setValue(300), 50);
        ts.schedule(() => presenter.setValue(420), 100);
      },
    );
    // Only the final value is persisted (debounce coalesces the burst).
    expect(sets).toEqual([420]);
    // The optimistic echoes for every keystroke are still visible.
    const valuesSeen = states.map((s) => s.value);
    expect(valuesSeen).toContain(200);
    expect(valuesSeen).toContain(300);
    expect(valuesSeen).toContain(420);
  });

  it("shows a success banner, then dismisses it after MESSAGE_DISMISS_MS", () => {
    const events: { time: number; message: ThroughputView["message"] }[] = [];
    const ts = scheduler();
    ts.run(({ flush }) => {
      const built = fakeAdmin(ts, { get: { marble: "(a|)", values: { a: 100 } } });
      const presenter = new ThroughputPresenter(built.port);
      const sub = presenter.state$.subscribe((s) =>
        events.push({ time: ts.now(), message: s.message }),
      );
      ts.schedule(() => presenter.setValue(420), 1);
      flush();
      sub.unsubscribe();
    });
    const banner = events.find((e) => e.message?.isError === false);
    const dismissed = events.find(
      (e) => e.message === null && e.time > (banner?.time ?? 0),
    );
    expect(banner?.message).toEqual({
      text: "Throughput has been set to 420",
      isError: false,
    });
    // Banner appears after the debounce (~301ms) and dismisses 3000ms later.
    expect(banner!.time).toBe(1 + DEBOUNCE_MS);
    expect(dismissed!.time).toBe(1 + DEBOUNCE_MS + MESSAGE_DISMISS_MS);
  });

  it("shows an error banner when the write fails", () => {
    const { states } = run(
      (ts) =>
        fakeAdmin(ts, {
          get: { marble: "(a|)", values: { a: 100 } },
          set: () => ts.createColdObservable<void>("#", {}, new Error("boom")),
        }),
      ({ presenter, ts }) => {
        ts.schedule(() => presenter.setValue(800), 1);
      },
    );
    const errorBanner = states.find((s) => s.message?.isError === true);
    expect(errorBanner?.message).toEqual({
      text: "Error setting throughput",
      isError: true,
    });
  });

  it("falls back to the default value when the initial load fails", () => {
    const { states } = run((ts) =>
      fakeAdmin(ts, {
        get: { marble: "10ms #", error: new Error("network down") },
      }),
    );
    expect(states).toEqual([
      { value: 100, loading: true, message: null },
      { value: 100, loading: false, message: null },
    ]);
  });
});
