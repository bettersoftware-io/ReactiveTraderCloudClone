import { describe, expect, it } from "vitest";

import { BLOTTER_ROW_HIGHLIGHT_MS } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

export function describeRowHighlightContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("a new row is true synchronously and flips to false at exactly BLOTTER_ROW_HIGHLIGHT_MS", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rowHighlight(true);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([true]);
          await clock.advance(BLOTTER_ROW_HIGHLIGHT_MS - 1);
          await clock.settle();
          expect(c.values).toEqual([true]);
          await clock.advance(1);
          await clock.settle();
          expect(c.values).toEqual([true, false]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("a row that is not new is false and stays false", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rowHighlight(false);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([false]);
          await clock.advance(BLOTTER_ROW_HIGHLIGHT_MS);
          await clock.settle();
          expect(c.values).toEqual([false]);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("dispose() drops the machine's own keep-alive; releasing the last external subscriber alongside it before the timer fires tears the pipeline down, and a fresh subscription afterwards restarts independently", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rowHighlight(true);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([true]);
          // Mirrors real usage (useMachine disposes only after the
          // component's own subscription has unmounted): with BOTH the
          // machine's keep-alive and the last external subscriber gone, the
          // underlying timer is unsubscribed before it ever fires.
          c.unsubscribe();
          m.dispose();
          await clock.advance(BLOTTER_ROW_HIGHLIGHT_MS);
          await clock.settle();
          const fresh = collect(m.state$);
          expect(fresh.values).toEqual([true]);
          fresh.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
