import { describe, expect, it } from "vitest";

import { RFQ_COUNTDOWN_INTERVAL_MS } from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";

const TOTAL_MS: number = 3 * RFQ_COUNTDOWN_INTERVAL_MS;

export function describeRfqCountdownContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts at totalMs − elapsed synchronously and ticks down one interval per RFQ_COUNTDOWN_INTERVAL_MS", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqCountdown(Date.now(), TOTAL_MS);

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([TOTAL_MS]);
          await clock.advance(RFQ_COUNTDOWN_INTERVAL_MS - 1);
          await clock.settle();
          expect(c.values.at(-1)).toBe(TOTAL_MS);
          await clock.advance(1);
          await clock.settle();
          expect(c.values.at(-1)).toBe(TOTAL_MS - RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.advance(RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.settle();
          expect(c.values.at(-1)).toBe(
            TOTAL_MS - 2 * RFQ_COUNTDOWN_INTERVAL_MS,
          );
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("an RFQ created earlier starts lower; the countdown clamps at an inclusive 0 and then stays still", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const m = h.machines.rfqCountdown(
          Date.now() - RFQ_COUNTDOWN_INTERVAL_MS,
          TOTAL_MS,
        );

        try {
          const c = collect(m.state$);
          expect(c.values).toEqual([TOTAL_MS - RFQ_COUNTDOWN_INTERVAL_MS]);
          await clock.advance(2 * RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.settle();
          expect(c.values.at(-1)).toBe(0);
          const count = c.values.length;
          await clock.advance(2 * RFQ_COUNTDOWN_INTERVAL_MS);
          await clock.settle();
          expect(c.values).toHaveLength(count);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });

    it("an already-expired RFQ starts at 0; dispose() stops the ticks and a fresh subscription yields the current value synchronously", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();
        const expired = h.machines.rfqCountdown(
          Date.now() - 2 * TOTAL_MS,
          TOTAL_MS,
        );
        const live = h.machines.rfqCountdown(Date.now(), TOTAL_MS);

        try {
          const done = collect(expired.state$);
          expect(done.values).toEqual([0]);
          const c = collect(live.state$);
          c.unsubscribe();
          live.dispose();
          await clock.advance(TOTAL_MS);
          await clock.settle();
          const fresh = collect(live.state$);
          expect(fresh.values).toEqual([TOTAL_MS]);
          done.unsubscribe();
          fresh.unsubscribe();
        } finally {
          expired.dispose();
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
