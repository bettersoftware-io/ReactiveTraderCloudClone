import { describe, expect, it } from "vitest";

import {
  EQUITY_PRICE_HISTORY_SIZE,
  type EquityQuote,
  PRICE_HISTORY_CONFLATION_MS,
} from "@rtc/domain";

import { withFakeClock } from "#/harness/clock";
import { collect } from "#/harness/collect";
import { createEquityQuote } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

function lasts(window: readonly EquityQuote[]): number[] {
  return window.map((quote) => {
    return quote.last;
  });
}

export function describeEquityPriceHistoryContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("history$(symbol) is memoised per symbol", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.equityPriceHistory;
        expect(p.history$("MSFT")).toBe(p.history$("MSFT"));
        expect(p.history$("MSFT")).not.toBe(p.history$("AAPL"));
      } finally {
        await h.teardown();
      }
    });

    it("a never-mounted symbol has no value until its first quote; quotes accumulate into a window capped at EQUITY_PRICE_HISTORY_SIZE", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.equityPriceHistory.history$("MSFT"));
        await settle();
        expect(c.values).toEqual([]);
        h.driver.emitEquityQuote(createEquityQuote("MSFT", 1));
        h.driver.emitEquityQuote(createEquityQuote("MSFT", 2));
        await settle();
        expect(c.values.map(lasts)).toEqual([[1], [1, 2]]);

        for (let i = 3; i <= EQUITY_PRICE_HISTORY_SIZE + 3; i += 1) {
          h.driver.emitEquityQuote(createEquityQuote("MSFT", i));
        }

        await settle();
        const last = c.values.at(-1) ?? [];
        expect(last).toHaveLength(EQUITY_PRICE_HISTORY_SIZE);
        expect(lasts(last)[0]).toBe(4);
        expect(lasts(last).at(-1)).toBe(EQUITY_PRICE_HISTORY_SIZE + 3);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("two concurrent subscribers share one window and one quote subscription", async () => {
      const h = makeHarness();

      try {
        const stream = h.app.presenters.equityPriceHistory.history$("MSFT");
        const a = collect(stream);
        const b = collect(stream);
        h.driver.emitEquityQuote(createEquityQuote("MSFT", 1));
        await settle();
        expect(a.values.map(lasts)).toEqual([[1]]);
        expect(b.values.map(lasts)).toEqual([[1]]);
        a.unsubscribe();
        await settle();
        expect(h.driver.equityQuoteObserved("MSFT")).toBe(true);
        b.unsubscribe();
        await settle();
        expect(h.driver.equityQuoteObserved("MSFT")).toBe(false);
      } finally {
        await h.teardown();
      }
    });

    it("retains the window across a remount: the port is released on the last unsubscribe, and a resubscribe repaints the newest window synchronously", async () => {
      const h = makeHarness();

      try {
        const first = collect(
          h.app.presenters.equityPriceHistory.history$("MSFT"),
        );

        for (let i = 1; i <= EQUITY_PRICE_HISTORY_SIZE + 2; i += 1) {
          h.driver.emitEquityQuote(createEquityQuote("MSFT", i));
        }

        await settle();
        first.unsubscribe();
        await settle();
        expect(h.driver.equityQuoteObserved("MSFT")).toBe(false);

        const again = collect(
          h.app.presenters.equityPriceHistory.history$("MSFT"),
        );
        expect(again.values).toHaveLength(1);
        expect(lasts(again.values[0] ?? [])[0]).toBe(3);
        expect(again.values[0]).toHaveLength(EQUITY_PRICE_HISTORY_SIZE);

        h.driver.emitEquityQuote(
          createEquityQuote("MSFT", EQUITY_PRICE_HISTORY_SIZE + 3),
        );
        await settle();
        expect(lasts(again.values.at(-1) ?? []).at(-1)).toBe(
          EQUITY_PRICE_HISTORY_SIZE + 3,
        );
        again.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("while calm, delivers at most one window per PRICE_HISTORY_CONFLATION_MS — the last of a burst, with no quote lost from the window", async () => {
      await withFakeClock(async (clock) => {
        const h = makeHarness();

        try {
          h.app.presenters.powerSaver.setLevel("calm");
          await clock.settle();
          const c = collect(
            h.app.presenters.equityPriceHistory.history$("MSFT"),
          );
          h.driver.emitEquityQuote(createEquityQuote("MSFT", 1));
          await clock.settle();
          expect(c.values.map(lasts)).toEqual([[1]]);
          h.driver.emitEquityQuote(createEquityQuote("MSFT", 2));
          h.driver.emitEquityQuote(createEquityQuote("MSFT", 3));
          await clock.advance(PRICE_HISTORY_CONFLATION_MS - 1);
          expect(c.values.map(lasts)).toEqual([[1]]);
          await clock.advance(1);
          await clock.settle();
          expect(c.values.map(lasts)).toEqual([[1], [1, 2, 3]]);
          c.unsubscribe();
        } finally {
          await h.teardown();
          await clock.settle();
        }
      });
    });
  });
}
