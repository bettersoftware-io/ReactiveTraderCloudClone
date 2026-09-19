import { describe, expect, it } from "vitest";

import {
  PRICE_HISTORY_CONFLATION_MS,
  PRICE_HISTORY_SIZE,
  type PriceTick,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createTick } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

function mids(window: readonly PriceTick[]): number[] {
  return window.map((tick) => {
    return tick.mid;
  });
}

export function describePriceHistoryContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("history$(symbol) is memoised per symbol", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.priceHistory;
        expect(p.history$("EURUSD")).toBe(p.history$("EURUSD"));
        expect(p.history$("EURUSD")).not.toBe(p.history$("GBPUSD"));
      } finally {
        await h.teardown();
      }
    });

    it("a never-mounted symbol has no synchronous value; ticks accumulate into a window capped at PRICE_HISTORY_SIZE", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.priceHistory.history$("EURUSD"));
        expect(c.values).toEqual([]);
        h.driver.tickPrice(createTick("EURUSD", 1));
        h.driver.tickPrice(createTick("EURUSD", 2));
        h.driver.tickPrice(createTick("EURUSD", 3));
        await settle();
        expect(c.values.map(mids)).toEqual([[1], [1, 2], [1, 2, 3]]);

        for (let i = 4; i <= PRICE_HISTORY_SIZE + 3; i += 1) {
          h.driver.tickPrice(createTick("EURUSD", i));
        }

        await settle();
        const last = c.values.at(-1);
        expect(last).toHaveLength(PRICE_HISTORY_SIZE);
        expect(mids(last ?? [])[0]).toBe(4);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("retains the window across a remount: the port is released on the last unsubscribe, and a resubscribe repaints the accumulated window synchronously", async () => {
      const h = makeHarness();

      try {
        const first = collect(h.app.presenters.priceHistory.history$("EURUSD"));
        h.driver.tickPrice(createTick("EURUSD", 1));
        h.driver.tickPrice(createTick("EURUSD", 2));
        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.priceObserved("EURUSD")).toBe(false);
        const again = collect(h.app.presenters.priceHistory.history$("EURUSD"));
        expect(again.values.map(mids)).toEqual([[1, 2]]);
        h.driver.tickPrice(createTick("EURUSD", 3));
        await settle();
        expect(mids(again.values.at(-1) ?? [])).toEqual([1, 2, 3]);
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("while calm, delivers at most one window per PRICE_HISTORY_CONFLATION_MS — the last window of a burst, never an intermediate", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          h.app.presenters.powerSaver.setLevel("calm");
          await clock.settle();
          const c = collect(h.app.presenters.priceHistory.history$("EURUSD"));
          h.driver.tickPrice(createTick("EURUSD", 1));
          await clock.settle();
          expect(c.values.map(mids)).toEqual([[1]]);
          h.driver.tickPrice(createTick("EURUSD", 2));
          h.driver.tickPrice(createTick("EURUSD", 3));
          await clock.advance(PRICE_HISTORY_CONFLATION_MS - 1);
          expect(c.values.map(mids)).toEqual([[1]]);
          await clock.advance(1);
          await clock.settle();
          expect(c.values.map(mids)).toEqual([[1], [1, 2, 3]]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
