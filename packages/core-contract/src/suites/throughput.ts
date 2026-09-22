import { describe, expect, it } from "vitest";

import {
  DEFAULT_THROUGHPUT,
  THROUGHPUT_DEBOUNCE_MS,
  THROUGHPUT_MESSAGE_DISMISS_MS,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

/** A value the load resolves to in every case that needs a settled
 * baseline before exercising `setValue` — distinct from `DEFAULT_THROUGHPUT`
 * so a case can tell "resolved" from "still defaulted". */
const BASELINE_VALUE = 50;

/** `throughput` (ruling 5): a global singleton — synchronous `{ value:
 * DEFAULT_THROUGHPUT, loading: true, message: null }`; the initial load
 * resolves to the loaded value or falls back to the default on error;
 * `setValue` reflects optimistically, then debounces the write; a write's
 * result shows a banner that auto-dismisses; a newer debounced value
 * supersedes an in-flight write's dismiss timer, but not an already
 * SETTLED write's banner. Every case runs under `withFakeClock`, one
 * collector held for the whole case (the RxJS core's cold resubscribe
 * behaviour on `getThroughput` is deliberately uncontracted — ruling 5). */
export function describeThroughputContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts loading, at the default value, with no banner — synchronously", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.throughput.state$);
          expect(c.values).toEqual([
            { value: DEFAULT_THROUGHPUT, loading: true, message: null },
          ]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a successful load lands the loaded value, not loading", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.throughput.state$);
          h.driver.resolveThroughputLoad(250);
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            value: 250,
            loading: false,
            message: null,
          });
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a failed load falls back to the default value, not loading, and errors no subscriber", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const c = collect(h.app.presenters.throughput.state$);
          h.driver.failThroughputLoad(new Error("x"));
          await clock.settle();
          expect(c.values.at(-1)).toEqual({
            value: DEFAULT_THROUGHPUT,
            loading: false,
            message: null,
          });
          expect(c.errors).toEqual([]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("setValue reflects optimistically at once, then writes only after the debounce elapses", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const m = h.app.presenters.throughput;
          const c = collect(m.state$);
          h.driver.resolveThroughputLoad(BASELINE_VALUE);
          await clock.settle();
          // The load LANDED: BASELINE_VALUE, not DEFAULT_THROUGHPUT. This is
          // what makes the resolve load-bearing in every case that starts
          // from a loaded view — a resolve issued before the first subscriber
          // finds an empty queue and does nothing, which reads exactly like a
          // resolved load until something asserts the value.
          expect(c.values.at(-1)).toEqual({
            value: BASELINE_VALUE,
            loading: false,
            message: null,
          });
          m.setValue(300);
          await clock.settle();
          expect(c.values.at(-1)?.value).toBe(300);
          expect(h.driver.pendingThroughputWrites()).toEqual([]);
          await clock.advance(THROUGHPUT_DEBOUNCE_MS - 1);
          expect(h.driver.pendingThroughputWrites()).toEqual([]);
          await clock.advance(1);
          expect(h.driver.pendingThroughputWrites()).toEqual([300]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("rapid setValue calls inside the debounce window coalesce to exactly one write, of the last value", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const m = h.app.presenters.throughput;
          // `state$` is a cold `StateObservable` (`@rx-state/core`), not a
          // `shareReplay`-warmed stream — a live subscriber is what keeps
          // `write$`'s `debounceTime`/`switchMap` chain running at all, so
          // every case in this suite holds one collector open (ruling 5).
          // It also has to be subscribed BEFORE the load is resolved: the
          // port is called on first subscribe, so a resolve issued earlier
          // finds an empty queue and silently does nothing.
          const c = collect(m.state$);
          h.driver.resolveThroughputLoad(BASELINE_VALUE);
          await clock.settle();
          m.setValue(1);
          await clock.advance(100);
          m.setValue(2);
          await clock.advance(THROUGHPUT_DEBOUNCE_MS);
          expect(h.driver.pendingThroughputWrites()).toEqual([2]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a successful write shows a confirmation banner that auto-dismisses at the boundary", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const m = h.app.presenters.throughput;
          const c = collect(m.state$);
          h.driver.resolveThroughputLoad(BASELINE_VALUE);
          await clock.settle();
          m.setValue(2);
          await clock.advance(THROUGHPUT_DEBOUNCE_MS);
          h.driver.resolveThroughputWrite();
          await clock.settle();
          // "Throughput has been set to 2" is `throughputSetMessage(2)` in
          // @rtc/client-core's adminFolds.ts; this suite may not import
          // client-core, so the banner text is spelled literally.
          expect(c.values.at(-1)?.message).toEqual({
            text: "Throughput has been set to 2",
            isError: false,
          });
          await clock.advance(THROUGHPUT_MESSAGE_DISMISS_MS - 1);
          expect(c.values.at(-1)?.message).not.toBeNull();
          await clock.advance(1);
          expect(c.values.at(-1)?.message).toBeNull();
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a failed write shows an error banner that auto-dismisses the same way", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const m = h.app.presenters.throughput;
          const c = collect(m.state$);
          h.driver.resolveThroughputLoad(BASELINE_VALUE);
          await clock.settle();
          m.setValue(2);
          await clock.advance(THROUGHPUT_DEBOUNCE_MS);
          h.driver.failThroughputWrite(new Error("nope"));
          await clock.settle();
          // "Error setting throughput" is `THROUGHPUT_SET_ERROR` in
          // @rtc/client-core's adminFolds.ts — spelled literally, as above.
          expect(c.values.at(-1)?.message).toEqual({
            text: "Error setting throughput",
            isError: true,
          });
          await clock.advance(THROUGHPUT_MESSAGE_DISMISS_MS - 1);
          expect(c.values.at(-1)?.message).not.toBeNull();
          await clock.advance(1);
          expect(c.values.at(-1)?.message).toBeNull();
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a keystroke made while a write is in flight does not supersede it: an early resolve still shows that write's banner", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const m = h.app.presenters.throughput;
          const c = collect(m.state$);
          h.driver.resolveThroughputLoad(BASELINE_VALUE);
          await clock.settle();
          m.setValue(5);
          await clock.advance(THROUGHPUT_DEBOUNCE_MS);
          expect(h.driver.pendingThroughputWrites()).toEqual([5]);
          m.setValue(9);
          h.driver.resolveThroughputWrite();
          await clock.settle();
          expect(c.values.at(-1)?.message).toEqual({
            text: "Throughput has been set to 5",
            isError: false,
          });
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a newer value's debounce DOES supersede an in-flight write: it is withdrawn and the newer one is written instead", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const m = h.app.presenters.throughput;
          const c = collect(m.state$);
          h.driver.resolveThroughputLoad(BASELINE_VALUE);
          await clock.settle();
          m.setValue(5);
          await clock.advance(THROUGHPUT_DEBOUNCE_MS);
          expect(h.driver.pendingThroughputWrites()).toEqual([5]);
          m.setValue(9);
          await clock.advance(THROUGHPUT_DEBOUNCE_MS);
          expect(h.driver.pendingThroughputWrites()).toEqual([9]);
          h.driver.resolveThroughputWrite();
          await clock.settle();
          expect(c.values.at(-1)?.message).toEqual({
            text: "Throughput has been set to 9",
            isError: false,
          });
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });

    // Verified directly against the RxJS core (ruling 5): `write$`'s outer
    // `switchMap` — from the debounced value to `admin.setThroughput(value)
    // .pipe(…, switchMap(message => concat(banner, dismissTimer)))` — is ONE
    // operator spanning both the write AND its banner's dismiss timer. A
    // newer debounced value unsubscribes the whole previous inner
    // Observable, dismiss timer included, whether or not that write had
    // already settled. So a banner already up when a newer value's debounce
    // fires is orphaned: its dismiss timer is dropped, and — because the
    // newer write has not resolved yet — nothing replaces it. This is the
    // RxJS core's actual behaviour, taken as the contract.
    it("a newer write's debounce firing drops an already-shown banner's dismiss timer, orphaning it", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const m = h.app.presenters.throughput;
          const c = collect(m.state$);
          h.driver.resolveThroughputLoad(BASELINE_VALUE);
          await clock.settle();
          m.setValue(5);
          await clock.advance(THROUGHPUT_DEBOUNCE_MS);
          h.driver.resolveThroughputWrite();
          await clock.settle();
          expect(c.values.at(-1)?.message).toEqual({
            text: "Throughput has been set to 5",
            isError: false,
          });
          m.setValue(9);
          await clock.advance(THROUGHPUT_DEBOUNCE_MS);
          await clock.advance(THROUGHPUT_MESSAGE_DISMISS_MS);
          expect(c.values.at(-1)?.message).toEqual({
            text: "Throughput has been set to 5",
            isError: false,
          });
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
