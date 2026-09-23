import { describe, expect, it } from "vitest";

import type { BootSequenceState } from "@rtc/core-api";
import { BOOT_DURATION_MS, BOOT_TICK_MS, BOOT_VARIANTS } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

const TICKS: number = Math.ceil(BOOT_DURATION_MS / BOOT_TICK_MS);

/** `machines.boot(onDone)` — the boot splash's progress ramp. */
export function describeBootContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("creating it advances the stored boot variant once, and it opens on the variant it was created with, at 0", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          const preference = h.app.presenters.bootPreference;
          const variant = preference.current();
          const m = h.machines.boot(() => {});
          const c = collect(m.state$);
          expect(preference.current()).toBe(
            BOOT_VARIANTS[
              (BOOT_VARIANTS.indexOf(variant) + 1) % BOOT_VARIANTS.length
            ],
          );
          expect(c.values.at(0)).toEqual({ variant, progress: 0, done: false });
          c.unsubscribe();
          m.dispose();
          await clock.settle();
        } finally {
          await h.teardown();
        }
      });
    });

    it("ramps one step per BOOT_TICK_MS, is not done one tick early, and finishes at 100 calling onDone exactly once", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          let done = 0;
          const m = h.machines.boot(() => {
            done += 1;
          });
          const c = collect(m.state$);
          await clock.settle();
          await clock.advance(BOOT_TICK_MS * 10);
          expect(c.values.at(-1)?.progress).toBe(
            Math.min(100, Math.round((10 / TICKS) * 100)),
          );
          await clock.advance(BOOT_TICK_MS * (TICKS - 11));
          expect(c.values.at(-1)?.done).toBe(false);
          expect(done).toBe(0);
          await clock.advance(BOOT_TICK_MS);
          expect(c.values.at(-1)).toMatchObject({ progress: 100, done: true });
          await clock.advance(BOOT_TICK_MS * 5);
          expect(done).toBe(1);
          c.unsubscribe();
          m.dispose();
        } finally {
          await h.teardown();
        }
      });
    });

    it("skip finishes at once and calls onDone once — never again when the ramp would have ended, nor on a second skip", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          let done = 0;
          const m = h.machines.boot(() => {
            done += 1;
          });
          const c = collect(m.state$);
          await clock.advance(BOOT_TICK_MS * 3);
          m.intents.skip();
          await clock.settle();
          expect(c.values.at(-1)).toMatchObject({ progress: 100, done: true });
          expect(done).toBe(1);
          const settledCount = c.values.length;
          await clock.advance(BOOT_DURATION_MS * 2);
          m.intents.skip();
          await clock.settle();
          expect(done).toBe(1);
          // A second skip may re-emit the finished state (RxJS does); it
          // must never emit anything that is not finished.
          expect(
            c.values.slice(settledCount).every((s: BootSequenceState) => {
              return s.done && s.progress === 100;
            }),
          ).toBe(true);
          c.unsubscribe();
          m.dispose();
        } finally {
          await h.teardown();
        }
      });
    });

    // States after dispose() are uncontracted (as slice 2 left machines):
    // the RxJS core's dispose releases the machine's own subscriptions and
    // a subscriber still attached keeps hearing the ramp. What dispose DOES
    // promise is that the shell is never told the boot finished.
    it("dispose before the ramp ends means onDone never runs", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          let done = 0;
          const m = h.machines.boot(() => {
            done += 1;
          });
          const c = collect(m.state$);
          await clock.advance(BOOT_TICK_MS * 3);
          m.dispose();
          await clock.advance(BOOT_DURATION_MS * 2);
          expect(done).toBe(0);
          c.unsubscribe();
        } finally {
          await h.teardown();
        }
      });
    });
  });
}
