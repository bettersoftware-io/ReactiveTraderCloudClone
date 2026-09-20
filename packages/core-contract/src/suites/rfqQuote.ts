import { describe, expect, it } from "vitest";

import { collect } from "#/harness/collect";
import { createRfqQuoteResult, EURUSD } from "#/harness/fixtures";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

export function describeRfqQuoteContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("requestQuote is lazy — the port sees the request only once subscribed — and the result lands", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqQuote;
        const quote = p.requestQuote(EURUSD.symbol, EURUSD.pipsPosition);
        expect(h.driver.pendingRfqQuotes()).toEqual([]);
        const c = collect(quote);
        await settle();
        expect(h.driver.pendingRfqQuotes()).toEqual([
          { symbol: "EURUSD", pipsPosition: EURUSD.pipsPosition },
        ]);
        const result = createRfqQuoteResult(1.1);
        h.driver.resolveRfqQuote(result);
        await settle();
        expect(c.values).toEqual([result]);
        expect(c.errors).toEqual([]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("unsubscribing withdraws the request; a failing request errors the result", async () => {
      const h = makeHarness();

      try {
        const p = h.app.presenters.rfqQuote;
        const withdrawn = collect(p.requestQuote("EURUSD", 4));
        await settle();
        withdrawn.unsubscribe();
        await settle();
        expect(h.driver.pendingRfqQuotes()).toEqual([]);
        const failing = collect(p.requestQuote("EURUSD", 4));
        await settle();
        h.driver.failRfqQuote(new Error("bust"));
        await settle();
        expect(failing.errors).toHaveLength(1);
        expect(failing.values).toEqual([]);
      } finally {
        await h.teardown();
      }
    });
  });
}
